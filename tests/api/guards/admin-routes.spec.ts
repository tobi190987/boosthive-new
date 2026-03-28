import { expect, test } from '@playwright/test'
import { tenantGet, tenantPost } from '../helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from '../helpers/fixtures'

test.describe('admin-only route guards (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('Member accessing GET /api/tenant/members returns 403', async ({ request }) => {
    const response = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/members',
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(response.status()).toBe(403)
  })

  test('Member accessing POST /api/tenant/invitations returns 403', async ({ request }) => {
    const response = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/invitations',
      sessions.tenantASeed.tenant.id,
      { email: 'test@example.com', role: 'member' },
      sessions.tenantAMemberCookies
    )
    expect(response.status()).toBe(403)
  })
})
