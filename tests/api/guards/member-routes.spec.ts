import { expect, test } from '@playwright/test'
import { tenantDelete, tenantGet, tenantPatch } from '../helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from '../helpers/fixtures'

test.describe('member route guards (API)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('Member accessing GET /api/tenant/members without tenant header returns 400 or 403', async ({ request }) => {
    // Missing x-tenant-id header — edge case: fehlender Tenant-Header
    const response = await request.get(
      `http://localhost:3000/api/tenant/members`,
      {
        headers: {
          cookie: `bh_preview_access=granted; ${sessions.tenantAMemberCookies}`,
          // intentionally no x-tenant-id
        },
      }
    )
    expect([400, 403]).toContain(response.status())
  })

  test('Member cannot PATCH member role (admin-only)', async ({ request }) => {
    // Get any member ID — use the admin's own ID as placeholder (doesn't matter, should 403 before lookup)
    const response = await tenantPatch(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/members/${sessions.tenantASeed.users.admin}/role`,
      sessions.tenantASeed.tenant.id,
      { role: 'admin' },
      sessions.tenantAMemberCookies
    )
    expect(response.status()).toBe(403)
  })

  test('Owner session cannot access tenant member routes without tenant context', async ({ request }) => {
    // Owner has no tenant_id in JWT — should be rejected by tenant guard
    const response = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/members',
      sessions.tenantASeed.tenant.id,
      sessions.ownerCookies
    )
    expect(response.status()).toBe(403)
  })

  test('Member cannot DELETE another member (admin-only)', async ({ request }) => {
    const response = await tenantDelete(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/members/some-user-id`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(response.status()).toBe(403)
  })
})
