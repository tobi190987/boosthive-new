import { createClient } from '@/lib/supabase'
import { isOnboardingComplete } from '@/lib/profile'
import { requireTenantContext } from '@/lib/tenant'
import { getActiveModuleCodes } from '@/lib/module-access'

export type TenantShellRole = 'admin' | 'member'

export interface TenantShellContext {
  tenant: {
    id: string
    slug: string
    name: string
    logoUrl: string | null
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
  activeModuleCodes: string[]
}

/**
 * Resolves the current authenticated tenant user together with tenant metadata.
 * Intended for tenant server layouts and pages that should render without FOUC.
 */
export async function requireTenantShellContext(): Promise<TenantShellContext> {
  const supabase = await createClient()
  const tenant = await requireTenantContext()

  // For development on localhost, return mock context
  if (process.env.NODE_ENV === 'development' && tenant.slug === 'localhost') {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('User not authenticated for development mode.')
    }

    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: 'Development Tenant',
        logoUrl: null,
        billingCompany: null,
        billingStreet: null,
        billingZip: null,
        billingCity: null,
        billingCountry: null,
        billingVatId: null,
        billingOnboardingCompletedAt: null,
      },
      user: {
        id: user.id,
        email: user.email ?? 'dev@example.com',
        firstName: 'Dev',
        lastName: 'User',
        avatarUrl: null,
      },
      membership: {
        role: 'admin' as TenantShellRole,
        onboardingCompletedAt: new Date().toISOString(),
      },
      onboarding: {
        isComplete: true,
      },
      activeModuleCodes: ['all'],
    }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('User not authenticated.')
  }

  try {
    const [
      { data: tenantRecord, error: tenantError },
      { data: membership, error: membershipError },
      { data: profile },
      activeModuleCodes,
    ] = await Promise.all([
      supabase
        .from('tenants')
        .select(
          'id, name, slug, logo_url, billing_company, billing_street, billing_zip, billing_city, billing_country, billing_vat_id, billing_onboarding_completed_at'
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
      getActiveModuleCodes(tenant.id),
    ])

    const tenantData = tenantRecord
    const membershipData = membership
    const profileData = profile

    if (tenantError || !tenantData) {
      throw new Error('Tenant metadata could not be loaded for: tenant shell.')
    }

    if (membershipError || !membershipData) {
      throw new Error('Tenant membership could not be loaded for: tenant shell.')
    }

    const onboardingComplete = isOnboardingComplete({
      role: membershipData.role as TenantShellRole,
      profile: profileData,
      tenant: tenantData,
      onboardingCompletedAt: membershipData.onboarding_completed_at,
    })

    return {
      tenant: {
        id: tenantData.id,
        slug: tenantData.slug,
        name: tenantData.name,
        logoUrl: tenantData.logo_url ?? null,
        billingCompany: tenantData.billing_company ?? null,
        billingStreet: tenantData.billing_street ?? null,
        billingZip: tenantData.billing_zip ?? null,
        billingCity: tenantData.billing_city ?? null,
        billingCountry: tenantData.billing_country ?? null,
        billingVatId: tenantData.billing_vat_id ?? null,
        billingOnboardingCompletedAt: tenantData.billing_onboarding_completed_at ?? null,
      },
      user: {
        id: user.id,
        email: user.email ?? 'Unbekannter Nutzer',
        firstName: profileData?.first_name ?? null,
        lastName: profileData?.last_name ?? null,
        avatarUrl: profileData?.avatar_url ?? null,
      },
      membership: {
        role: membershipData.role as TenantShellRole,
        onboardingCompletedAt: membershipData.onboarding_completed_at ?? null,
      },
      onboarding: {
        isComplete: onboardingComplete,
      },
      activeModuleCodes,
    }
  } catch (error) {
    // Fallback to mock data for development
    if (process.env.NODE_ENV === 'development') {
      return {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: 'Development Tenant',
          logoUrl: null,
          billingCompany: null,
          billingStreet: null,
          billingZip: null,
          billingCity: null,
          billingCountry: null,
          billingVatId: null,
          billingOnboardingCompletedAt: null,
        },
        user: {
          id: user.id,
          email: user.email ?? 'dev@example.com',
          firstName: 'Dev',
          lastName: 'User',
          avatarUrl: null,
        },
        membership: {
          role: 'admin' as TenantShellRole,
          onboardingCompletedAt: new Date().toISOString(),
        },
        onboarding: {
          isComplete: true,
        },
        activeModuleCodes: ['all'],
      }
    }
    throw error
  }
}
