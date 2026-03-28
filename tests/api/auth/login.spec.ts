import { expect, test } from '@playwright/test'
import {
  buildCookieHeader,
  nextTestIp,
  rootOrigin,
  rootUrl,
  tenantOrigin,
  tenantUrl,
} from '../helpers/api-client'
import { cleanupTenant, seedTenant, type SeedResult } from '../helpers/fixtures'

test.describe('login API (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, 'e2e-api-login')
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, 'e2e-api-login')
  })

  test('POST /api/auth/login with wrong credentials returns 401', async ({ request }) => {
    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/login'),
      {
        headers: {
          'content-type': 'application/json',
          origin: tenantOrigin(seed.tenant.slug),
          'x-tenant-id': seed.tenant.id,
          'x-forwarded-for': nextTestIp(),
          cookie: buildCookieHeader(),
        },
        data: {
          email: seed.users.admin.email,
          password: 'WrongPassword123!',
        },
      }
    )

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  test('POST /api/auth/login without body returns 400', async ({ request }) => {
    const response = await request.post(
      tenantUrl(seed.tenant.slug, '/api/auth/login'),
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

  test('POST /api/auth/owner/login with wrong credentials returns 401', async ({ request }) => {
    const response = await request.post(rootUrl('/api/auth/owner/login'), {
      headers: {
        'content-type': 'application/json',
        origin: rootOrigin(),
        'x-forwarded-for': nextTestIp(),
        cookie: buildCookieHeader(),
      },
      data: {
        email: seed.users.owner.email,
        password: 'WrongPassword123!',
      },
    })

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })
})
