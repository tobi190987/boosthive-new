import { createClient } from '@/lib/supabase'
import { requireTenantContext } from '@/lib/tenant'

export type TenantShellRole = 'admin' | 'member'

export interface TenantShellContext {
  tenant: {
    id: string
    slug: string
    name: string
  }
  user: {
    id: string
    email: string
  }
  membership: {
    role: TenantShellRole
  }
}

/**
 * Resolves the current authenticated tenant user together with tenant metadata.
 * Intended for tenant server layouts and pages that should render without FOUC.
 */
export async function requireTenantShellContext(): Promise<TenantShellContext> {
  const supabase = await createClient()
  const tenant = await requireTenantContext()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Tenant shell requires an authenticated user session.')
  }

  const [{ data: tenantRecord, error: tenantError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('id', tenant.id)
        .single(),
      supabase
        .from('tenant_members')
        .select('role, status')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single(),
    ])

  if (tenantError || !tenantRecord) {
    throw new Error('Tenant metadata could not be loaded for the tenant shell.')
  }

  if (membershipError || !membership) {
    throw new Error('Tenant membership could not be loaded for the tenant shell.')
  }

  return {
    tenant: {
      id: tenantRecord.id,
      slug: tenantRecord.slug,
      name: tenantRecord.name,
    },
    user: {
      id: user.id,
      email: user.email ?? 'Unbekannter Nutzer',
    },
    membership: {
      role: membership.role as TenantShellRole,
    },
  }
}
