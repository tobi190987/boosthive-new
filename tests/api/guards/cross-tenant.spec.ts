import { expect, test } from '@playwright/test'
import { tenantGet } from '../helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from '../helpers/fixtures'

test.describe('cross-tenant access guards (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('Admin Tenant A accessing /api/tenant/members with Tenant B header returns 403', async ({
    request,
  }) => {
    const response = await tenantGet(
      request,
      sessions.tenantBSeed.tenant.slug,
      '/api/tenant/members',
      sessions.tenantBSeed.tenant.id,
      sessions.tenantAAdminCookies
    )
    expect(response.status()).toBe(403)
  })

  test('Admin Tenant A accessing /api/tenant/invitations with Tenant B header returns 403', async ({
    request,
  }) => {
    const response = await tenantGet(
      request,
      sessions.tenantBSeed.tenant.slug,
      '/api/tenant/invitations',
      sessions.tenantBSeed.tenant.id,
      sessions.tenantAAdminCookies
    )
    expect(response.status()).toBe(403)
  })
})
