import { expect, test } from '@playwright/test'
import { ownerGet } from '../helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from '../helpers/fixtures'

test.describe('owner route guards (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('GET /api/owner/dashboard without session returns 401', async ({ request }) => {
    const response = await ownerGet(request, '/api/owner/dashboard')
    expect(response.status()).toBe(401)
  })

  test('GET /api/owner/dashboard with member session returns 403', async ({ request }) => {
    const response = await ownerGet(
      request,
      '/api/owner/dashboard',
      sessions.tenantAMemberCookies
    )
    expect(response.status()).toBe(403)
  })

  test('GET /api/owner/tenants without session returns 401', async ({ request }) => {
    const response = await ownerGet(request, '/api/owner/tenants')
    expect(response.status()).toBe(401)
  })
})
