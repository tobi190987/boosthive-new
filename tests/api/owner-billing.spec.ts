import { expect, test } from '@playwright/test'
import { ownerGet } from './helpers/api-client'
import { cleanupTenant, seedTenant, type SeedResult } from './helpers/fixtures'

test.describe('owner billing api', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let accessibleSeed: SeedResult
  let billingBlockedSeed: SeedResult
  let manualLockedSeed: SeedResult
  let ownerCookieHeader = ''

  test.beforeAll(async ({ request }) => {
    accessibleSeed = await seedTenant(request, 'e2e-owner-billing-active', {
      subscriptionStatus: 'active',
      billingOnboardingCompleted: true,
    })
    billingBlockedSeed = await seedTenant(request, 'e2e-owner-billing-past-due', {
      subscriptionStatus: 'past_due',
      billingOnboardingCompleted: true,
    })
    manualLockedSeed = await seedTenant(request, 'e2e-owner-billing-locked', {
      status: 'inactive',
      subscriptionStatus: 'active',
      billingOnboardingCompleted: true,
    })

    ownerCookieHeader = `bh_preview_access=granted; ${await request
      .post('http://localhost:3000/api/auth/owner/login', {
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          cookie: 'bh_preview_access=granted',
        },
        data: {
          email: accessibleSeed.users.owner.email,
          password: accessibleSeed.users.owner.password,
        },
      })
      .then(async (response) => {
        expect(response.ok()).toBeTruthy()
        return response.headersArray()
          .filter((header) => header.name.toLowerCase() === 'set-cookie')
          .map((header) => header.value.split(';')[0])
          .join('; ')
      })}`
  })

  test.afterAll(async ({ request }) => {
    await Promise.all([
      cleanupTenant(request, 'e2e-owner-billing-active'),
      cleanupTenant(request, 'e2e-owner-billing-past-due'),
      cleanupTenant(request, 'e2e-owner-billing-locked'),
    ])
  })

  test('filters tenants by access state', async ({ request }) => {
    const manualLockedResponse = await ownerGet(
      request,
      '/api/owner/billing?access=manual_locked&q=e2e-owner-billing',
      ownerCookieHeader
    )
    expect(manualLockedResponse.ok()).toBeTruthy()
    const manualLockedPayload = await manualLockedResponse.json()

    expect(manualLockedPayload.pagination.total).toBe(1)
    expect(manualLockedPayload.tenants).toHaveLength(1)
    expect(manualLockedPayload.tenants[0].id).toBe(manualLockedSeed.tenant.id)
    expect(manualLockedPayload.tenants[0].accessState).toBe('manual_locked')

    const billingBlockedResponse = await ownerGet(
      request,
      '/api/owner/billing?access=billing_blocked&q=e2e-owner-billing',
      ownerCookieHeader
    )
    expect(billingBlockedResponse.ok()).toBeTruthy()
    const billingBlockedPayload = await billingBlockedResponse.json()

    if (billingBlockedSeed.capabilities.subscriptionStatusAvailable) {
      expect(billingBlockedPayload.pagination.total).toBe(1)
      expect(billingBlockedPayload.tenants).toHaveLength(1)
      expect(billingBlockedPayload.tenants[0].id).toBe(billingBlockedSeed.tenant.id)
      expect(billingBlockedPayload.tenants[0].accessState).toBe('billing_blocked')
    } else {
      expect(billingBlockedPayload.pagination.total).toBe(0)
      expect(billingBlockedPayload.tenants).toHaveLength(0)
    }

    const accessibleResponse = await ownerGet(
      request,
      '/api/owner/billing?access=accessible&q=e2e-owner-billing',
      ownerCookieHeader
    )
    expect(accessibleResponse.ok()).toBeTruthy()
    const accessiblePayload = await accessibleResponse.json()

    if (accessibleSeed.capabilities.subscriptionStatusAvailable) {
      expect(accessiblePayload.pagination.total).toBe(1)
      expect(accessiblePayload.tenants).toHaveLength(1)
      expect(accessiblePayload.tenants[0].id).toBe(accessibleSeed.tenant.id)
      expect(accessiblePayload.tenants[0].accessState).toBe('accessible')
    } else {
      expect(accessiblePayload.pagination.total).toBe(2)
      expect(accessiblePayload.tenants).toHaveLength(2)
      expect(accessiblePayload.tenants.map((tenant: { id: string }) => tenant.id).sort()).toEqual(
        [accessibleSeed.tenant.id, billingBlockedSeed.tenant.id].sort()
      )
      expect(
        accessiblePayload.tenants.every(
          (tenant: { accessState: string }) => tenant.accessState === 'accessible'
        )
      ).toBeTruthy()
    }
  })

  test('rate limits repeated owner billing requests', async ({ request }) => {
    let rateLimitedResponse = null as Awaited<ReturnType<typeof ownerGet>> | null

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const response = await ownerGet(request, '/api/owner/billing', ownerCookieHeader)
      if (response.status() === 429) {
        rateLimitedResponse = response
        break
      }
    }

    expect(rateLimitedResponse, 'expected owner billing route to return 429').not.toBeNull()
    expect(rateLimitedResponse?.status()).toBe(429)
  })
})
