import { expect, test } from '@playwright/test'
import { previewCookieName, rootUrl, tenantUrl } from './helpers'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

function cookiePairsFromSetCookieHeader(header: string | null | undefined) {
  if (!header) return []

  return header
    .split(/,(?=[^;]+?=)/g)
    .map((part) => part.split(';')[0]?.trim())
    .filter((value): value is string => Boolean(value))
}

test.describe('tenant status model', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let setupSeed: SeedResult
  let inactiveSeed: SeedResult
  let billingBlockedSeed: SeedResult
  let archivedSeed: SeedResult

  test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(90_000)

    ;[setupSeed, inactiveSeed, billingBlockedSeed, archivedSeed] = await Promise.all([
      seedTenant(request, 'e2e-status-setup'),
      seedTenant(request, 'e2e-status-inactive', {
        status: 'inactive',
        billingOnboardingCompleted: true,
      }),
      seedTenant(request, 'e2e-status-billing', {
        status: 'active',
        subscriptionStatus: 'past_due',
        billingOnboardingCompleted: true,
      }),
      seedTenant(request, 'e2e-status-archived', {
        status: 'active',
        billingOnboardingCompleted: true,
        archived: true,
      }),
    ])
  })

  test.afterAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(90_000)

    await Promise.all([
      cleanupTenant(request, 'e2e-status-setup'),
      cleanupTenant(request, 'e2e-status-inactive'),
      cleanupTenant(request, 'e2e-status-billing'),
      cleanupTenant(request, 'e2e-status-archived'),
    ])
  })

  test('setup_incomplete erlaubt Login', async ({ request }) => {
    const loginResponse = await request.post(tenantUrl(setupSeed.tenant.slug, '/api/auth/login'), {
      headers: {
        cookie: `${previewCookieName}=granted`,
        'content-type': 'application/json',
      },
      data: {
        email: setupSeed.users.member.email,
        password: setupSeed.users.member.password,
      },
    })

    expect(loginResponse.ok()).toBeTruthy()
  })

  test('Owner-API blendet archivierte Tenants standardmaessig aus und liefert effektive Status', async ({
    request,
  }) => {
    const loginResponse = await request.post(rootUrl('/api/auth/owner/login'), {
      headers: {
        cookie: `${previewCookieName}=granted`,
        'content-type': 'application/json',
      },
      data: {
        email: setupSeed.users.owner.email,
        password: setupSeed.users.owner.password,
      },
    })

    expect(loginResponse.ok()).toBeTruthy()
    const loginCookies = cookiePairsFromSetCookieHeader(loginResponse.headers()['set-cookie'])

    const tenantsResponse = await request.get(rootUrl('/api/owner/tenants'), {
      headers: {
        cookie: [`${previewCookieName}=granted`, ...loginCookies].join('; '),
      },
    })

    expect(tenantsResponse.ok()).toBeTruthy()
    const payload = (await tenantsResponse.json()) as {
      tenants: { slug: string; status: string }[]
    }

    const setupTenant = payload.tenants.find((tenant) => tenant.slug === setupSeed.tenant.slug)
    const inactiveTenant = payload.tenants.find((tenant) => tenant.slug === inactiveSeed.tenant.slug)
    const billingTenant = payload.tenants.find((tenant) => tenant.slug === billingBlockedSeed.tenant.slug)
    const archivedTenant = payload.tenants.find((tenant) => tenant.slug === archivedSeed.tenant.slug)

    expect(setupTenant?.status).toBe('setup_incomplete')
    expect(inactiveTenant?.status).toBe('inactive')

    if (billingBlockedSeed.capabilities.subscriptionStatusAvailable) {
      expect(billingTenant?.status).toBe('billing_blocked')
    }

    if (archivedSeed.capabilities.archivedSoftDeleteAvailable) {
      expect(archivedTenant).toBeUndefined()
    }
  })

  test('inactive blockiert neue Tenant-Logins', async ({ request }) => {
    const loginResponse = await request.post(tenantUrl(inactiveSeed.tenant.slug, '/api/auth/login'), {
      headers: {
        cookie: `${previewCookieName}=granted`,
        'content-type': 'application/json',
      },
      data: {
        email: inactiveSeed.users.member.email,
        password: inactiveSeed.users.member.password,
      },
    })

    expect(loginResponse.status()).toBe(401)
  })

  test('billing_blocked blockiert neue Tenant-Logins', async ({ request }) => {
    test.skip(
      !billingBlockedSeed.capabilities.subscriptionStatusAvailable,
      'Lokale Supabase kennt subscription_status nicht im Schema-Cache.'
    )

    const loginResponse = await request.post(
      tenantUrl(billingBlockedSeed.tenant.slug, '/api/auth/login'),
      {
        headers: {
          cookie: `${previewCookieName}=granted`,
          'content-type': 'application/json',
        },
        data: {
          email: billingBlockedSeed.users.member.email,
          password: billingBlockedSeed.users.member.password,
        },
      }
    )

    expect(loginResponse.status()).toBe(401)
  })

  test('archivierte Tenants blockieren neue Tenant-Logins', async ({ request }) => {
    test.skip(
      !archivedSeed.capabilities.archivedSoftDeleteAvailable,
      'Lokale Supabase kennt die Soft-Delete-Spalten noch nicht im Schema-Cache.'
    )

    const loginResponse = await request.post(
      tenantUrl(archivedSeed.tenant.slug, '/api/auth/login'),
      {
        headers: {
          cookie: `${previewCookieName}=granted`,
          'content-type': 'application/json',
        },
        data: {
          email: archivedSeed.users.member.email,
          password: archivedSeed.users.member.password,
        },
      }
    )

    expect(loginResponse.status()).toBe(401)
  })
})
