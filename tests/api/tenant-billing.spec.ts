import { expect, test } from '@playwright/test'
import { tenantGet } from './helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from './helpers/fixtures'

test.describe('tenant billing api', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request)
  })

  test('Member can load module catalog from GET /api/tenant/billing without payment details', async ({
    request,
  }) => {
    const response = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/billing',
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )

    expect(response.status()).toBe(200)

    const payload = await response.json()
    expect(Array.isArray(payload.modules)).toBeTruthy()
    expect(payload.payment_method).toBeNull()
    expect(payload.plan).toBeNull()
  })
})
