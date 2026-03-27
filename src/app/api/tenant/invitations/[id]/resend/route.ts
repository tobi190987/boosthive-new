import { after, NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { sendInvitation } from '@/lib/email'
import {
  buildInvitationUrl,
  createInvitationToken,
  deriveInvitationStatus,
} from '@/lib/invitations'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

function mapInvitation(invitation: {
  id: string
  email: string
  role: 'admin' | 'member'
  created_at: string
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string | null
  accepted_name?: string | null
}) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: deriveInvitationStatus(invitation),
    invitedAt: invitation.created_at,
    name: invitation.accepted_name ?? undefined,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const supabaseAdmin = createAdminClient()

  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id, email, role, created_at, accepted_at, revoked_at, expires_at, accepted_name')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (invitationError) {
    console.error('[POST /api/tenant/invitations/[id]/resend] Laden fehlgeschlagen:', invitationError)
    return NextResponse.json({ error: 'Einladung konnte nicht erneut versendet werden.' }, { status: 500 })
  }

  if (!invitation) {
    return NextResponse.json({ error: 'Einladung nicht gefunden.' }, { status: 404 })
  }

  if (invitation.accepted_at) {
    return NextResponse.json(
      { error: 'Bereits angenommene Einladungen können nicht erneut versendet werden.' },
      { status: 409 }
    )
  }

  if (invitation.revoked_at) {
    return NextResponse.json(
      { error: 'Widerrufene Einladungen können nicht erneut versendet werden.' },
      { status: 409 }
    )
  }

  const { rawToken, tokenHash, expiresAt } = createInvitationToken()
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  const { data: replacementInvitation, error: createError } = await supabaseAdmin
    .from('tenant_invitations')
    .insert({
      tenant_id: tenantId,
      email: invitation.email,
      role: invitation.role,
      expires_at: expiresAt.toISOString(),
      last_sent_at: new Date().toISOString(),
      token_hash: tokenHash,
      invited_by: authResult.auth.userId,
    })
    .select('id, email, role, created_at, accepted_at, revoked_at, expires_at, accepted_name')
    .single()

  if (createError || !replacementInvitation) {
    console.error(
      '[POST /api/tenant/invitations/[id]/resend] Ersatz-Einladung fehlgeschlagen:',
      createError
    )
    return NextResponse.json({ error: 'Einladung konnte nicht erneut versendet werden.' }, { status: 500 })
  }

  const invitationUrl = buildInvitationUrl(tenant.slug, rawToken)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const invitedByName =
    (user?.user_metadata?.display_name as string | undefined) ??
    (user?.email as string | undefined) ??
    'BoostHive Admin'

  after(async () => {
    try {
      await sendInvitation({
        to: replacementInvitation.email,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        invitationUrl,
        invitedByName,
        token: rawToken,
      })

      const { error: revokePreviousError } = await supabaseAdmin
        .from('tenant_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', invitation.id)

      if (revokePreviousError) {
        console.error(
          '[POST /api/tenant/invitations/[id]/resend] Vorherige Einladung konnte nicht widerrufen werden:',
          revokePreviousError
        )
      }
    } catch (error) {
      console.error('[POST /api/tenant/invitations/[id]/resend] Mailversand fehlgeschlagen:', error)

      const { error: rollbackError } = await supabaseAdmin
        .from('tenant_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', replacementInvitation.id)

      if (rollbackError) {
        console.error(
          '[POST /api/tenant/invitations/[id]/resend] Fehlgeschlagene Ersatz-Einladung konnte nicht widerrufen werden:',
          rollbackError
        )
      }
    }
  })

  return NextResponse.json({
    invitation: mapInvitation(replacementInvitation),
  })
}
