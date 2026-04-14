import { revalidatePath, unstable_cache } from 'next/cache'
import { cache } from 'react'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { isOnboardingComplete } from '@/lib/profile'
import { requireTenantContext } from '@/lib/tenant'
import { getActiveModuleCodes } from '@/lib/module-access'

function isMissingNotifyPreferenceColumn(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === '42703' ||
    error?.message?.includes('notify_on_approval_decision') === true ||
    error?.message?.includes("Could not find the 'notify_on_approval_decision' column") === true
  )
}

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
    notifyOnApprovalDecision: boolean
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

interface CachedTenantShellData {
  tenant: {
    id: string
    slug: string
    name: string
    logo_url: string | null
    billing_company: string | null
    billing_street: string | null
    billing_zip: string | null
    billing_city: string | null
    billing_country: string | null
    billing_vat_id: string | null
    billing_onboarding_completed_at: string | null
  }
  profile: {
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
    notify_on_approval_decision?: boolean | null
  } | null
  membership: {
    role: string
    status: string
    onboarding_completed_at: string | null
  }
  activeModuleCodes: string[]
}

/**
 * Fetches tenant DB data with persistent cross-request caching (5 min TTL).
 * Auth (getUser) and tenant resolution are NOT cached — only DB records.
 */
function fetchCachedTenantShellData(tenantId: string, userId: string) {
  return unstable_cache(
    async (): Promise<CachedTenantShellData> => {
      const admin = createAdminClient()

      const [
        { data: tenantRecord, error: tenantError },
        { data: membership, error: membershipError },
        profileResult,
        activeModuleCodes,
      ] = await Promise.all([
        admin
          .from('tenants')
          .select(
            'id, name, slug, logo_url, billing_company, billing_street, billing_zip, billing_city, billing_country, billing_vat_id, billing_onboarding_completed_at'
          )
          .eq('id', tenantId)
          .single(),
        admin
          .from('tenant_members')
          .select('role, status, onboarding_completed_at')
          .eq('tenant_id', tenantId)
          .eq('user_id', userId)
          .eq('status', 'active')
          .single(),
        admin
          .from('user_profiles')
          .select('first_name, last_name, avatar_url, notify_on_approval_decision')
          .eq('user_id', userId)
          .maybeSingle(),
        getActiveModuleCodes(tenantId),
      ])

      let profileData: CachedTenantShellData['profile'] = profileResult.data

      if (isMissingNotifyPreferenceColumn(profileResult.error)) {
        const fallbackProfile = await admin
          .from('user_profiles')
          .select('first_name, last_name, avatar_url')
          .eq('user_id', userId)
          .maybeSingle()
        profileData = fallbackProfile.data
      }

      if (tenantError || !tenantRecord) {
        throw new Error('Tenant metadata could not be loaded for: tenant shell.')
      }

      if (membershipError || !membership) {
        throw new Error('Tenant membership could not be loaded for: tenant shell.')
      }

      return {
        tenant: tenantRecord,
        profile: profileData,
        membership,
        activeModuleCodes,
      }
    },
    ['tenant-shell', tenantId, userId],
    { revalidate: 300 }
  )()
}

/**
 * Resolves the current authenticated tenant user together with tenant metadata.
 * Intended for tenant server layouts and pages that should render without FOUC.
 */
export const requireTenantShellContext = cache(async (): Promise<TenantShellContext> => {
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
        notifyOnApprovalDecision: false,
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
    const cached = await fetchCachedTenantShellData(tenant.id, user.id)
    const { tenant: tenantData, profile: profileData, membership: membershipData, activeModuleCodes } = cached

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
        notifyOnApprovalDecision: profileData?.notify_on_approval_decision ?? false,
      },
      membership: {
        role: membershipData.role as TenantShellRole,
        onboardingCompletedAt: membershipData.onboarding_completed_at ?? null,
      },
      onboarding: {
        isComplete: onboardingComplete,
      },
      activeModuleCodes,
    } satisfies TenantShellContext
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
          notifyOnApprovalDecision: false,
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
})

export function invalidateTenantShellContext(tenantId: string, userId: string) {
  void tenantId
  void userId
  revalidatePath('/', 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/onboarding')
  revalidatePath('/settings/profile')
}
