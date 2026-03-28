import { expect, test } from '@playwright/test'
import {
  buildCookieHeader,
  nextTestIp,
  tenantOrigin,
  tenantUrl,
} from '../helpers/api-client'
import { cleanupTenant, seedTenant, type SeedResult } from '../helpers/fixtures'

test.describe('password reset API (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, 'e2e-api-pw-reset')
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, 'e2e-api-pw-reset')
  })

  // --- /api/auth/password-reset/request ---

  test('POST /api/auth/password-reset/request without body returns 400', async ({ request }) => {
    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/password-reset/request'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seed.tenant.slug),
          'x-tenant-id': seed.tenant.id,
          'x-forwarded-for': nextTestIp(),
          cookie: buildCookieHeader(),
        },
      }
    )

    expect(response.status()).toBe(400)
  })

  test('POST /api/auth/password-reset/request with invalid email returns 400', async ({ request }) => {
    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/password-reset/request'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seed.tenant.slug),
          'x-tenant-id': seed.tenant.id,
          'x-forwarded-for': nextTestIp(),
          cookie: buildCookieHeader(),
        },
        data: { email: 'not-an-email' },
      }
    )

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  test('POST /api/auth/password-reset/request without tenant header returns 400', async ({ request }) => {
    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/password-reset/request'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seed.tenant.slug),
          'x-forwarded-for': nextTestIp(),
          cookie: buildCookieHeader(),
          // intentionally no x-tenant-id header
        },
        data: { email: seed.users.admin.email },
      }
    )

    expect(response.status()).toBe(400)
  })

  // --- /api/auth/password-reset/confirm ---

  test('POST /api/auth/password-reset/confirm with invalid token returns 400', async ({ request }) => {
    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/password-reset/confirm'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seed.tenant.slug),
          'x-tenant-id': seed.tenant.id,
          'x-forwarded-for': nextTestIp(),
          cookie: buildCookieHeader(),
        },
        data: {
          token: 'invalid-token-that-does-not-exist',
          password: 'NewPassword123!',
        },
      }
    )

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  test('POST /api/auth/password-reset/confirm without tenant header returns 400', async ({ request }) => {
    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/password-reset/confirm'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seed.tenant.slug),
          'x-forwarded-for': nextTestIp(),
          cookie: buildCookieHeader(),
          // intentionally no x-tenant-id header
        },
        data: {
          token: 'some-token',
          password: 'NewPassword123!',
        },
      }
    )

    expect(response.status()).toBe(400)
  })
})
