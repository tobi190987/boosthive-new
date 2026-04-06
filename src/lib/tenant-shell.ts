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

type TenantShellContextCacheEntry = {
  expiresAt: number
  value: TenantShellContext
}

const TENANT_SHELL_CONTEXT_TTL_MS = 15_000
const TENANT_SHELL_CONTEXT_MAX_ENTRIES = 200
const tenantShellContextCache = new Map<string, TenantShellContextCacheEntry>()
const tenantShellContextInflight = new Map<string, Promise<TenantShellContext>>()

function readTenantShellContextCache(key: string): TenantShellContext | undefined {
  const entry = tenantShellContextCache.get(key)
  if (!entry) return undefined

  if (entry.expiresAt <= Date.now()) {
    tenantShellContextCache.delete(key)
    return undefined
  }

  return entry.value
}

function writeTenantShellContextCache(key: string, value: TenantShellContext) {
  if (tenantShellContextCache.size >= TENANT_SHELL_CONTEXT_MAX_ENTRIES) {
    const now = Date.now()
    for (const [entryKey, entry] of tenantShellContextCache.entries()) {
      if (entry.expiresAt <= now) {
        tenantShellContextCache.delete(entryKey)
      }
    }

    if (tenantShellContextCache.size >= TENANT_SHELL_CONTEXT_MAX_ENTRIES) {
      const oldestKey = tenantShellContextCache.keys().next().value
      if (oldestKey) {
        tenantShellContextCache.delete(oldestKey)
      }
    }
  }

  tenantShellContextCache.set(key, {
    expiresAt: Date.now() + TENANT_SHELL_CONTEXT_TTL_MS,
    value,
  })
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

  const cacheKey = `${tenant.id}:${user.id}`
  const cachedContext = readTenantShellContextCache(cacheKey)
  if (cachedContext) {
    return cachedContext
  }

  const inflightContext = tenantShellContextInflight.get(cacheKey)
  if (inflightContext) {
    return inflightContext
  }

  const loadContext = (async (): Promise<TenantShellContext> => {
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
        .eq('id', tenant.id)
        .single(),
      admin
        .from('tenant_members')
        .select('role, status, onboarding_completed_at')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single(),
      admin
        .from('user_profiles')
        .select('first_name, last_name, avatar_url, notify_on_approval_decision')
        .eq('user_id', user.id)
        .maybeSingle(),
      getActiveModuleCodes(tenant.id),
    ])

    const tenantData = tenantRecord
    const membershipData = membership
    let profileData:
      | {
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
          notify_on_approval_decision?: boolean | null
        }
      | null = profileResult.data

    if (isMissingNotifyPreferenceColumn(profileResult.error)) {
      const fallbackProfile = await admin
        .from('user_profiles')
        .select('first_name, last_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle()
      profileData = fallbackProfile.data
    }

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

    const resolvedContext = {
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

    writeTenantShellContextCache(cacheKey, resolvedContext)
    return resolvedContext
  })()

  tenantShellContextInflight.set(cacheKey, loadContext)

  try {
    return await loadContext
  } catch (error) {
    tenantShellContextInflight.delete(cacheKey)
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

  finally {
    tenantShellContextInflight.delete(cacheKey)
  }
})
