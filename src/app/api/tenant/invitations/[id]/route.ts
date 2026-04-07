import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

export async function DELETE(
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

  const { data: invitation, error: loadError } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id, accepted_at, revoked_at')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (loadError) {
    console.error('[DELETE /api/tenant/invitations/[id]] Laden fehlgeschlagen:', loadError)
    return NextResponse.json({ error: 'Einladung konnte nicht widerrufen werden.' }, { status: 500 })
  }

  if (!invitation) {
    return NextResponse.json({ error: 'Einladung nicht gefunden.' }, { status: 404 })
  }

  if (invitation.accepted_at) {
    return NextResponse.json(
      { error: 'Bereits angenommene Einladungen können nicht widerrufen werden.' },
      { status: 409 }
    )
  }

  if (!invitation.revoked_at) {
    const { error: revokeError } = await supabaseAdmin
      .from('tenant_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', id)

    if (revokeError) {
      console.error('[DELETE /api/tenant/invitations/[id]] Widerruf fehlgeschlagen:', revokeError)
      return NextResponse.json(
        { error: 'Einladung konnte nicht widerrufen werden.' },
        { status: 500 }
      )
    }
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'tenant_invitation',
    resourceId: id,
    context: { revoked: true },
  })

  return NextResponse.json({ success: true })
}
