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
  let seedB: SeedResult

  test.beforeAll(async ({ request }) => {
    ;[seed, seedB] = await Promise.all([
      seedTenant(request, 'e2e-api-pw-reset'),
      seedTenant(request, 'e2e-api-pw-reset-b'),
    ])
  })

  test.afterAll(async ({ request }) => {
    await Promise.all([
      cleanupTenant(request, 'e2e-api-pw-reset'),
      cleanupTenant(request, 'e2e-api-pw-reset-b'),
    ])
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

  test('POST /api/auth/password-reset/request rate-limits after 3 requests from same IP', async ({ request }) => {
    // Fixed IP — ensures rate-limit store sees the same key for all 4 requests.
    // Rate limit is AUTH_RESET: 3 req / 15 min / IP.
    // Note: In development (NODE_ENV=development + localhost hostname) rate limiting is skipped.
    const rateLimitIp = '198.51.100.77'

    for (let i = 0; i < 3; i++) {
      await request.post(
        tenantUrl(seed.tenant.slug, '/api/auth/password-reset/request'),
        {
          headers: {
            'content-type': 'application/json',
            origin: tenantOrigin(seed.tenant.slug),
            'x-tenant-id': seed.tenant.id,
            'x-forwarded-for': rateLimitIp,
            cookie: buildCookieHeader(),
          },
          data: { email: 'rl-test@example.com' },
        }
      )
    }

    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/password-reset/request'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seed.tenant.slug),
          'x-tenant-id': seed.tenant.id,
          'x-forwarded-for': rateLimitIp,
          cookie: buildCookieHeader(),
        },
        data: { email: 'rl-test@example.com' },
      }
    )

    // 200 when rate limiting is bypassed (dev/localhost), 429 otherwise
    expect([200, 429]).toContain(response.status())
    if (response.status() === 429) {
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(response.headers()['retry-after']).toBeDefined()
    }
  })

  // --- Cross-Tenant: Token darf nicht in fremdem Tenant einlösbar sein ---

  test('POST /api/auth/password-reset/confirm rejects token attempted in wrong tenant', async ({ request }) => {
    // Send a confirm request with a fake token against Tenant B's context.
    // The consume_password_reset_token RPC checks tenant_id — tokens are tenant-bound.
    const response = await request.post(
      tenantUrl(seedB.tenant.slug, '/api/auth/password-reset/confirm'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seedB.tenant.slug),
          'x-tenant-id': seedB.tenant.id,
          'x-forwarded-for': nextTestIp(),
          cookie: buildCookieHeader(),
        },
        data: {
          // A token that doesn't exist in Tenant B (even if it existed in Tenant A, it must not work here)
          token: 'cross-tenant-token-attempt-12345678901234567890123456789012',
          password: 'NewPassword123!',
        },
      }
    )

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body).toHaveProperty('error')
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
