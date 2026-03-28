import { APIRequestContext } from '@playwright/test'
import { loginAndGetCookies, rootUrl } from './api-client'

const e2eToken = process.env.E2E_TEST_HELPER_TOKEN ?? 'local-e2e-token'

export interface SeedResult {
  tenant: {
    id: string
    slug: string
    name: string
  }
  capabilities: {
    subscriptionStatusAvailable: boolean
    archivedSoftDeleteAvailable: boolean
  }
  users: {
    owner: {
      email: string
      password: string
    }
    admin: {
      email: string
      password: string
    }
    member: {
      email: string
      password: string
    }
  }
}

export interface TestSessions {
  ownerCookies: string
  tenantAAdminCookies: string
  tenantAMemberCookies: string
  tenantBAdminCookies: string
  pausedTenantAdminCookies: string

  tenantASeed: SeedResult
  tenantBSeed: SeedResult
  pausedTenantSeed: SeedResult
  cleanupSlugs: [string, string, string]
}

export async function seedTenant(
  request: APIRequestContext,
  slug: string,
  options: {
    status?: 'active' | 'inactive'
    subscriptionStatus?: string | null
    billingOnboardingCompleted?: boolean
    archived?: boolean
  } = {}
): Promise<SeedResult> {
  const response = await request.post(rootUrl('/api/test/e2e/seed'), {
    headers: {
      'x-e2e-token': e2eToken,
      'content-type': 'application/json',
    },
    data: {
      slug,
      status: options.status,
      subscriptionStatus: options.subscriptionStatus,
      billingOnboardingCompleted: options.billingOnboardingCompleted,
      archived: options.archived,
    },
  })

  if (!response.ok()) {
    throw new Error(
      `seedTenant(${slug}) fehlgeschlagen mit ${response.status()}: ${await response.text()}`
    )
  }
  return (await response.json()) as SeedResult
}

export async function cleanupTenant(request: APIRequestContext, slug: string) {
  const response = await request.delete(rootUrl('/api/test/e2e/seed'), {
    headers: {
      'x-e2e-token': e2eToken,
      'content-type': 'application/json',
    },
    data: { slug },
  })

  if (!response.ok()) {
    throw new Error(
      `cleanupTenant(${slug}) fehlgeschlagen mit ${response.status()}: ${await response.text()}`
    )
  }
}

function createSessionSlugs() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    tenantA: `e2e-api-a-${suffix}`,
    tenantB: `e2e-api-b-${suffix}`,
    pausedTenant: `e2e-api-paused-${suffix}`,
  }
}

async function createPausedTenantSession(request: APIRequestContext, slug: string) {
  const activeSeed = await seedTenant(request, slug)

  const adminCookies = await loginAndGetCookies(
    request,
    activeSeed.tenant.slug,
    activeSeed.users.admin.email,
    activeSeed.users.admin.password
  )

  await cleanupTenant(request, slug)
  const pausedSeed = await seedTenant(request, slug, { status: 'inactive' })

  return {
    adminCookies,
    pausedSeed,
  }
}

/**
 * Seeds three tenants and logs in to create session cookies for each role.
 *
 * - Tenant A: active, with admin + member
 * - Tenant B: active, with admin (for cross-tenant tests)
 * - Paused Tenant: inactive, with admin (for paused-tenant tests)
 */
export async function setupTestSessions(request: APIRequestContext): Promise<TestSessions> {
  const slugs = createSessionSlugs()
  const [tenantASeed, tenantBSeed] = await Promise.all([
    seedTenant(request, slugs.tenantA),
    seedTenant(request, slugs.tenantB),
  ])

  // Login sessions sequentially to avoid auth/race flakiness during test bootstrap.
  const ownerCookies = await loginAndGetCookies(
    request,
    '',
    tenantASeed.users.owner.email,
    tenantASeed.users.owner.password,
    {
      ownerLogin: true,
    }
  )
  const tenantAAdminCookies = await loginAndGetCookies(
    request,
    tenantASeed.tenant.slug,
    tenantASeed.users.admin.email,
    tenantASeed.users.admin.password
  )
  const tenantAMemberCookies = await loginAndGetCookies(
    request,
    tenantASeed.tenant.slug,
    tenantASeed.users.member.email,
    tenantASeed.users.member.password
  )
  const tenantBAdminCookies = await loginAndGetCookies(
    request,
    tenantBSeed.tenant.slug,
    tenantBSeed.users.admin.email,
    tenantBSeed.users.admin.password
  )
  const pausedTenant = await createPausedTenantSession(request, slugs.pausedTenant)

  return {
    ownerCookies,
    tenantAAdminCookies,
    tenantAMemberCookies,
    tenantBAdminCookies,
    pausedTenantAdminCookies: pausedTenant.adminCookies,

    tenantASeed,
    tenantBSeed,
    pausedTenantSeed: pausedTenant.pausedSeed,
    cleanupSlugs: [slugs.tenantA, slugs.tenantB, slugs.pausedTenant],
  }
}

export async function cleanupTestSessions(request: APIRequestContext, sessions: TestSessions) {
  if (!sessions) {
    return
  }

  await Promise.all([
    ...sessions.cleanupSlugs.map((slug) => cleanupTenant(request, slug)),
  ])
}
