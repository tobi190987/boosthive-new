import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

export interface PortalAuthContext {
  authUserId: string
  portalUserId: string
  tenantId: string
  customerId: string
}

/**
 * Verifies that the current request is authenticated as a portal user.
 *
 * Portal users have `app_metadata.portal_user_id` set on their Supabase Auth account.
 * This is distinct from tenant members who have `app_metadata.tenant_id` + `app_metadata.role`.
 *
 * tenantId comes from the x-tenant-id header injected by the proxy.
 */
export async function requirePortalUser(
  tenantId: string
): Promise<{ auth: PortalAuthContext } | { error: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 }),
    }
  }

  const meta = user.app_metadata as Record<string, unknown>
  const portalUserId = typeof meta?.portal_user_id === 'string' ? meta.portal_user_id : null

  if (!portalUserId) {
    return {
      error: NextResponse.json({ error: 'Kein Portal-Zugang.' }, { status: 401 }),
    }
  }

  // Verify the portal user record still exists, is active, and belongs to this tenant
  const admin = createAdminClient()
  const { data: portalUser, error: dbError } = await admin
    .from('client_portal_users')
    .select('id, is_active, tenant_id, customer_id')
    .eq('id', portalUserId)
    .eq('tenant_id', tenantId)
    .single()

  if (dbError || !portalUser) {
    return {
      error: NextResponse.json({ error: 'Portal-Zugang nicht gefunden.' }, { status: 401 }),
    }
  }

  if (!portalUser.is_active) {
    return {
      error: NextResponse.json({ error: 'Dein Zugang wurde deaktiviert.' }, { status: 401 }),
    }
  }

  return {
    auth: {
      authUserId: user.id,
      portalUserId,
      tenantId,
      customerId: portalUser.customer_id as string,
    },
  }
}
