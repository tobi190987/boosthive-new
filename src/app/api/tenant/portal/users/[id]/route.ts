import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const PORTAL_WRITE = { limit: 20, windowMs: 60 * 1000 }

/**
 * DELETE /api/tenant/portal/users/[id]
 *
 * Deactivates a portal user (soft delete — is_active = false).
 * The auth account remains but future session checks will fail.
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

  // Soft-deactivate
  const { error: updateError } = await admin
    .from('client_portal_users')
    .update({ is_active: false })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Sign out the auth user if linked (invalidates existing sessions)
  if (portalUser.auth_user_id) {
    await admin.auth.admin.signOut(portalUser.auth_user_id as string, 'global').catch(() => {
      // Non-fatal: user may already be signed out
    })
  }

  return NextResponse.json({ success: true })
}
