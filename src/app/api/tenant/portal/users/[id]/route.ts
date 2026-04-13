import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const PORTAL_WRITE = { limit: 20, windowMs: 60 * 1000 }

/**
 * DELETE /api/tenant/portal/users/[id]
 *
 * ?hard=true  → Hard-delete: removes DB row + deletes Supabase Auth account.
 * (default)   → Soft-deactivate: sets is_active = false, invalidates sessions.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`portal-users-write:${tenantId}:${getClientIp(request)}`, PORTAL_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const hard = new URL(request.url).searchParams.get('hard') === 'true'
  const admin = createAdminClient()

  // Verify the portal user belongs to this tenant
  const { data: portalUser } = await admin
    .from('client_portal_users')
    .select('id, auth_user_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!portalUser) {
    return NextResponse.json({ error: 'Portal-User nicht gefunden.' }, { status: 404 })
  }

  if (hard) {
    // Hard-delete: remove DB row + delete Supabase Auth account
    const { error: deleteError } = await admin
      .from('client_portal_users')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    if (portalUser.auth_user_id) {
      await admin.auth.admin.deleteUser(portalUser.auth_user_id as string).catch(() => {
        // Non-fatal: auth account may already be absent
      })
    }
  } else {
    // Soft-deactivate
    const { error: updateError } = await admin
      .from('client_portal_users')
      .update({ is_active: false })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (portalUser.auth_user_id) {
      await admin.auth.admin.signOut(portalUser.auth_user_id as string, 'global').catch(() => {
        // Non-fatal: user may already be signed out
      })
    }
  }

  return NextResponse.json({ success: true })
}
