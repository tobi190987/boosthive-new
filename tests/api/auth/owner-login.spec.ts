import { expect, test } from '@playwright/test'
import {
  buildCookieHeader,
  nextTestIp,
  rootOrigin,
  rootUrl,
} from '../helpers/api-client'
import { cleanupTenant, seedTenant, type SeedResult } from '../helpers/fixtures'

test.describe('owner login API (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, 'e2e-api-owner-login')
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, 'e2e-api-owner-login')
  })

  test('POST /api/auth/owner/login without body returns 400', async ({ request }) => {
    const response = await request.post(rootUrl('/api/auth/owner/login'), {
      headers: {
        'content-type': 'application/json',
        origin: rootOrigin(),
        'x-forwarded-for': nextTestIp(),
        cookie: buildCookieHeader(),
      },
    })

    expect(response.status()).toBe(400)
  })

  test('POST /api/auth/owner/login with missing email returns 400', async ({ request }) => {
    const response = await request.post(rootUrl('/api/auth/owner/login'), {
      headers: {
        'content-type': 'application/json',
        origin: rootOrigin(),
        'x-forwarded-for': nextTestIp(),
        cookie: buildCookieHeader(),
      },
      data: { password: 'SomePassword123!' },
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  test('POST /api/auth/owner/login with non-owner account returns 403', async ({ request }) => {
    const response = await request.post(rootUrl('/api/auth/owner/login'), {
      headers: {
        'content-type': 'application/json',
        origin: rootOrigin(),
        'x-forwarded-for': nextTestIp(),
        cookie: buildCookieHeader(),
      },
      data: {
        email: seed.users.admin.email,
        password: seed.users.admin.password,
      },
    })

    // Admin user is not a platform owner → should not succeed
    expect([401, 403]).toContain(response.status())
  })
})
