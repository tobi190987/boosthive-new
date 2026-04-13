import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const FINALIZE_RL = { limit: 10, windowMs: 60 * 1000 }

/**
 * POST /api/portal/auth/finalize
 *
 * Called by the client-side /portal/auth/callback page after setting the session
 * from the invite URL hash (#access_token=...).
 *
 * inviteUserByEmail stores portal metadata in user_metadata (not app_metadata).
 * This endpoint promotes those values to app_metadata (which requirePortalUser checks)
 * and records the last_login timestamp.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(`portal-finalize:${tenantId}:${getClientIp(request)}`, FINALIZE_RL)
  if (!rl.allowed) return rateLimitResponse(rl)

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }

  // portal_user_id may already be in app_metadata (repeated login) or
  // only in user_metadata (first login after invite).
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>

  const portalUserId =
    (typeof appMeta.portal_user_id === 'string' ? appMeta.portal_user_id : null) ??
    (typeof userMeta.portal_user_id === 'string' ? userMeta.portal_user_id : null)

  if (!portalUserId) {
    return NextResponse.json({ error: 'Kein Portal-Zugang in Token.' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: portalUser } = await admin
    .from('client_portal_users')
    .select('id, customer_id, is_active')
    .eq('id', portalUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!portalUser) {
    return NextResponse.json({ error: 'Portal-Zugang nicht gefunden.' }, { status: 401 })
  }

  if (!portalUser.is_active) {
    return NextResponse.json({ error: 'Dein Zugang wurde deaktiviert.' }, { status: 401 })
  }

  // Promote to app_metadata (only admins/service-role can set this — not spoofable by users)
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      portal_user_id: portalUser.id,
      customer_id: portalUser.customer_id,
      tenant_id: tenantId,
    },
  })

  // Record login + link auth_user_id
  await admin
    .from('client_portal_users')
    .update({
      auth_user_id: user.id,
      last_login: new Date().toISOString(),
    })
    .eq('id', portalUser.id)

  return NextResponse.json({ success: true })
}
