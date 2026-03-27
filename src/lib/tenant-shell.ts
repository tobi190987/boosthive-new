import { createClient } from '@/lib/supabase'
import { isOnboardingComplete } from '@/lib/profile'
import { requireTenantContext } from '@/lib/tenant'

export type TenantShellRole = 'admin' | 'member'

export interface TenantShellContext {
  tenant: {
    id: string
    slug: string
    name: string
    billingCompany: string | null
    billingStreet: string | null
    billingZip: string | null
    billingCity: string | null
    billingCountry: string | null
    billingVatId: string | null
    billingOnboardingCompletedAt: string | null
  }
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    avatarUrl: string | null
  }
  membership: {
    role: TenantShellRole
    onboardingCompletedAt: string | null
  }
  onboarding: {
    isComplete: boolean
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

  const [
    { data: tenantRecord, error: tenantError },
    { data: membership, error: membershipError },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from('tenants')
      .select(
        'id, name, slug, billing_company, billing_street, billing_zip, billing_city, billing_country, billing_vat_id, billing_onboarding_completed_at'
      )
      .eq('id', tenant.id)
      .single(),
    supabase
      .from('tenant_members')
      .select('role, status, onboarding_completed_at')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single(),
    supabase
      .from('user_profiles')
      .select('first_name, last_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (tenantError || !tenantRecord) {
    throw new Error('Tenant metadata could not be loaded for the tenant shell.')
  }

  if (membershipError || !membership) {
    throw new Error('Tenant membership could not be loaded for the tenant shell.')
  }

  const onboardingComplete = isOnboardingComplete({
    role: membership.role as TenantShellRole,
    profile,
    tenant: tenantRecord,
    onboardingCompletedAt: membership.onboarding_completed_at,
  })

  return {
    tenant: {
      id: tenantRecord.id,
      slug: tenantRecord.slug,
      name: tenantRecord.name,
      billingCompany: tenantRecord.billing_company ?? null,
      billingStreet: tenantRecord.billing_street ?? null,
      billingZip: tenantRecord.billing_zip ?? null,
      billingCity: tenantRecord.billing_city ?? null,
      billingCountry: tenantRecord.billing_country ?? null,
      billingVatId: tenantRecord.billing_vat_id ?? null,
      billingOnboardingCompletedAt: tenantRecord.billing_onboarding_completed_at ?? null,
    },
    user: {
      id: user.id,
      email: user.email ?? 'Unbekannter Nutzer',
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    },
    membership: {
      role: membership.role as TenantShellRole,
      onboardingCompletedAt: membership.onboarding_completed_at ?? null,
    },
    onboarding: {
      isComplete: onboardingComplete,
    },
  }
}
