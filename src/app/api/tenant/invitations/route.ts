import { after, NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { sendInvitation } from '@/lib/email'
import {
  buildInvitationUrl,
  createInvitationToken,
  deriveInvitationStatus,
} from '@/lib/invitations'
import { CreateInvitationSchema } from '@/lib/schemas/invitations'
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

interface ExistingInvitationRef {
  id: string
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id, email, role, created_at, accepted_at, revoked_at, expires_at, accepted_name')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/tenant/invitations] Laden fehlgeschlagen:', error)
    return NextResponse.json({ error: 'Einladungen konnten nicht geladen werden.' }, { status: 500 })
  }

  return NextResponse.json({
    invitations: (data ?? []).map(mapInvitation),
  })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = CreateInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase()
  const { rawToken, tokenHash, expiresAt } = createInvitationToken()
  const supabaseAdmin = createAdminClient()

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  const existingUserLookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
    p_email: normalizedEmail,
  })

  if (existingUserLookup.error) {
    console.error('[POST /api/tenant/invitations] User-Lookup fehlgeschlagen:', existingUserLookup.error)
    return NextResponse.json({ error: 'Einladung konnte nicht erstellt werden.' }, { status: 500 })
  }

  const existingUser = existingUserLookup.data?.[0] ?? null
  let existingMembership: { id: string; status: string } | null = null
  let membershipError: { message?: string } | null = null

  if (existingUser?.id) {
    const membershipResult = await supabaseAdmin
      .from('tenant_members')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('user_id', existingUser.id)
      .maybeSingle()

    existingMembership = membershipResult.data
    membershipError = membershipResult.error
  }

  if (membershipError) {
    console.error('[POST /api/tenant/invitations] Membership-Prüfung fehlgeschlagen:', membershipError)
    return NextResponse.json({ error: 'Einladung konnte nicht erstellt werden.' }, { status: 500 })
  }

  if (existingMembership) {
    return NextResponse.json(
      { error: 'User ist bereits Mitglied in diesem Tenant.' },
      { status: 409 }
    )
  }

  const { data: previousInvitations, error: previousInvitationsError } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', normalizedEmail)
    .is('accepted_at', null)
    .is('revoked_at', null)

  if (previousInvitationsError) {
    console.error(
      '[POST /api/tenant/invitations] Bestehende Einladungen konnten nicht geladen werden:',
      previousInvitationsError
    )
    return NextResponse.json({ error: 'Einladung konnte nicht erstellt werden.' }, { status: 500 })
  }

  const { data: createdInvitation, error: createError } = await supabaseAdmin
    .from('tenant_invitations')
    .insert({
      tenant_id: tenantId,
      email: normalizedEmail,
      role: parsed.data.role,
      token_hash: tokenHash,
      invited_by: authResult.auth.userId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, email, role, created_at, accepted_at, revoked_at, expires_at, accepted_name')
    .single()

  if (createError || !createdInvitation) {
    console.error('[POST /api/tenant/invitations] Anlegen fehlgeschlagen:', createError)
    return NextResponse.json({ error: 'Einladung konnte nicht erstellt werden.' }, { status: 500 })
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
        to: normalizedEmail,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        invitationUrl,
        invitedByName,
        token: rawToken,
      })

      const previousIds = ((previousInvitations ?? []) as ExistingInvitationRef[]).map(
        (invitation) => invitation.id
      )

      if (previousIds.length > 0) {
        const { error: revokePreviousError } = await supabaseAdmin
          .from('tenant_invitations')
          .update({ revoked_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .in('id', previousIds)

        if (revokePreviousError) {
          console.error(
            '[POST /api/tenant/invitations] Vorherige Einladungen konnten nach Versand nicht widerrufen werden:',
            revokePreviousError
          )
        }
      }
    } catch (error) {
      console.error('[POST /api/tenant/invitations] Mailversand fehlgeschlagen:', error)

      const { error: rollbackError } = await supabaseAdmin
        .from('tenant_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', createdInvitation.id)

      if (rollbackError) {
        console.error(
          '[POST /api/tenant/invitations] Fehlgeschlagene Einladung konnte nicht zurückgerollt werden:',
          rollbackError
        )
      }
    }
  })

  return NextResponse.json({
    invitation: mapInvitation(createdInvitation),
  })
}
