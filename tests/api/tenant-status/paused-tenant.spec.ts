import { expect, test } from '@playwright/test'
import { tenantGet } from '../helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from '../helpers/fixtures'

test.describe('paused tenant guards (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('Admin at paused tenant accessing /api/tenant/members returns 403', async ({
    request,
  }) => {
    const response = await tenantGet(
      request,
      sessions.pausedTenantSeed.tenant.slug,
      '/api/tenant/members',
      sessions.pausedTenantSeed.tenant.id,
      sessions.pausedTenantAdminCookies
    )
    expect(response.status()).toBe(403)
  })

  test('Admin at paused tenant accessing /api/tenant/billing returns 403', async ({
    request,
  }) => {
    const response = await tenantGet(
      request,
      sessions.pausedTenantSeed.tenant.slug,
      '/api/tenant/billing',
      sessions.pausedTenantSeed.tenant.id,
      sessions.pausedTenantAdminCookies
    )
    expect(response.status()).toBe(403)
  })
})
