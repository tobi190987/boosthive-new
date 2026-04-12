/**
 * PROJ-57: Budget & Ad Spend Tracking — API Tests
 *
 * Covers:
 * - Auth guards (unauthenticated → 401, member writes → 403)
 * - Admin CRUD: create, list, update, delete
 * - Member read access
 * - Manual spend entry
 * - Input validation
 * - Cross-tenant isolation
 */
import { expect, test } from '@playwright/test'
import { tenantGet, tenantPost, tenantDelete, tenantPut } from './helpers/api-client'
import { cleanupTestSessions, setupTestSessions, type TestSessions } from './helpers/fixtures'

const CURRENT_MONTH = (() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
})()

const BUDGET_MONTH = `${CURRENT_MONTH}-01`

test.describe('budget API (PROJ-57)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions
  let customerId: string
  let budgetId: string

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)

    // Create a customer for budget association
    const res = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/customers',
      sessions.tenantASeed.tenant.id,
      { name: 'Budget Test Kunde', industry: 'Technology', status: 'active' },
      sessions.tenantAAdminCookies
    )
    expect(res.status(), `Customer creation failed: ${await res.text()}`).toBe(201)
    const payload = await res.json()
    customerId = payload.customer.id
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  // ── Auth guards ──────────────────────────────────────────────────────────────

  test('unauthenticated GET /api/tenant/budgets returns 401', async ({ request }) => {
    const res = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/budgets',
      sessions.tenantASeed.tenant.id
      // no cookies
    )
    expect(res.status()).toBe(401)
  })

  test('member cannot POST /api/tenant/budgets (403)', async ({ request }) => {
    const res = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/budgets',
      sessions.tenantASeed.tenant.id,
      {
        customer_id: customerId,
        platform: 'google_ads',
        budget_month: BUDGET_MONTH,
        planned_amount: 1000,
      },
      sessions.tenantAMemberCookies
    )
    expect(res.status()).toBe(403)
  })

  test('member cannot DELETE /api/tenant/budgets/[id] (403)', async ({ request }) => {
    const res = await tenantDelete(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/budgets/00000000-0000-0000-0000-000000000000',
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(res.status()).toBe(403)
  })

  // ── Admin CRUD ───────────────────────────────────────────────────────────────

  test('admin can create a budget', async ({ request }) => {
    const res = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/budgets',
      sessions.tenantASeed.tenant.id,
      {
        customer_id: customerId,
        platform: 'google_ads',
        label: 'Brand Keywords',
        budget_month: BUDGET_MONTH,
        planned_amount: 2500,
        alert_threshold_percent: 80,
      },
      sessions.tenantAAdminCookies
    )

    const payload = await res.json()
    expect(res.status(), `create failed: ${JSON.stringify(payload)}`).toBe(201)
    expect(typeof payload.budget?.id).toBe('string')
    expect(payload.budget?.platform).toBe('google_ads')
    expect(payload.budget?.planned_amount).toBe(2500)
    expect(payload.budget?.label).toBe('Brand Keywords')
    expect(payload.budget?.spent_amount).toBe(0)

    budgetId = payload.budget.id
  })

  test('admin can list budgets for current month', async ({ request }) => {
    const res = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets?month=${CURRENT_MONTH}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAAdminCookies
    )

    const payload = await res.json()
    expect(res.status()).toBe(200)
    expect(Array.isArray(payload.budgets)).toBeTruthy()

    const found = payload.budgets.find((b: { id: string }) => b.id === budgetId)
    expect(found).toBeTruthy()
    expect(found.planned_amount).toBe(2500)
    expect(found.customer_name).toBeTruthy()
  })

  test('member can read (GET) budgets', async ({ request }) => {
    const res = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets?month=${CURRENT_MONTH}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(res.status()).toBe(200)
    const payload = await res.json()
    expect(Array.isArray(payload.budgets)).toBeTruthy()
  })

  test('admin can update a budget', async ({ request }) => {
    const res = await tenantPut(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets/${budgetId}`,
      sessions.tenantASeed.tenant.id,
      { planned_amount: 3000, alert_threshold_percent: 90 },
      sessions.tenantAAdminCookies
    )

    const payload = await res.json()
    expect(res.status(), `update failed: ${JSON.stringify(payload)}`).toBe(200)
    expect(payload.budget?.planned_amount).toBe(3000)
    expect(payload.budget?.alert_threshold_percent).toBe(90)
  })

  test('admin can add a manual spend entry', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0]

    const res = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets/${budgetId}/spend`,
      sessions.tenantASeed.tenant.id,
      { spend_date: today, amount: 120.5, source: 'manual' },
      sessions.tenantAAdminCookies
    )

    expect(res.status(), `spend entry failed: ${await res.text()}`).toBe(200)
    const payload = await res.json()
    expect(payload.success).toBe(true)
  })

  test('spend is reflected in budget list after manual entry', async ({ request }) => {
    const res = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets?month=${CURRENT_MONTH}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAAdminCookies
    )
    const payload = await res.json()
    const found = payload.budgets.find((b: { id: string }) => b.id === budgetId)
    expect(found).toBeTruthy()
    expect(found.spent_amount).toBeCloseTo(120.5, 1)
  })

  test('daily spend history is retrievable', async ({ request }) => {
    const res = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets/${budgetId}/spend`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAAdminCookies
    )
    const payload = await res.json()
    expect(res.status()).toBe(200)
    expect(Array.isArray(payload.entries)).toBeTruthy()
    const entry = payload.entries.find((e: { amount: number }) => e.amount > 100)
    expect(entry).toBeTruthy()
  })

  // ── Input validation ─────────────────────────────────────────────────────────

  test('creating budget with negative amount returns 400', async ({ request }) => {
    const res = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/budgets',
      sessions.tenantASeed.tenant.id,
      {
        customer_id: customerId,
        platform: 'google_ads',
        budget_month: BUDGET_MONTH,
        planned_amount: -100,
      },
      sessions.tenantAAdminCookies
    )
    expect(res.status()).toBe(400)
  })

  test('creating budget with invalid platform returns 400', async ({ request }) => {
    const res = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/budgets',
      sessions.tenantASeed.tenant.id,
      {
        customer_id: customerId,
        platform: 'twitter_ads',
        budget_month: BUDGET_MONTH,
        planned_amount: 500,
      },
      sessions.tenantAAdminCookies
    )
    expect(res.status()).toBe(400)
  })

  test('spend entry outside budget month returns 400', async ({ request }) => {
    const wrongDate = '2020-01-15'
    const res = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets/${budgetId}/spend`,
      sessions.tenantASeed.tenant.id,
      { spend_date: wrongDate, amount: 50 },
      sessions.tenantAAdminCookies
    )
    expect(res.status()).toBe(400)
  })

  // ── Cross-tenant isolation ───────────────────────────────────────────────────

  test('tenant B cannot read tenant A budgets', async ({ request }) => {
    // Tenant B admin reads with Tenant A's tenant-id header but Tenant B cookies
    const res = await tenantGet(
      request,
      sessions.tenantBSeed.tenant.slug,
      `/api/tenant/budgets?month=${CURRENT_MONTH}`,
      sessions.tenantASeed.tenant.id, // wrong tenant id for tenant B
      sessions.tenantBAdminCookies
    )
    // Either 401 (auth fails cross-tenant) or 200 with empty list (membership check fails)
    if (res.status() === 200) {
      const payload = await res.json()
      const hasTenantABudget = payload.budgets?.some((b: { id: string }) => b.id === budgetId)
      expect(hasTenantABudget).toBeFalsy()
    } else {
      expect([401, 403]).toContain(res.status())
    }
  })

  test('tenant B cannot delete tenant A budget', async ({ request }) => {
    const res = await tenantDelete(
      request,
      sessions.tenantBSeed.tenant.slug,
      `/api/tenant/budgets/${budgetId}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantBAdminCookies
    )
    expect([401, 403, 404]).toContain(res.status())
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  test('admin can delete a budget', async ({ request }) => {
    const res = await tenantDelete(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets/${budgetId}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAAdminCookies
    )
    expect(res.status(), `delete failed: ${await res.text()}`).toBe(200)
    const payload = await res.json()
    expect(payload.success).toBe(true)
  })

  test('deleted budget no longer appears in list', async ({ request }) => {
    const res = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/budgets?month=${CURRENT_MONTH}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAAdminCookies
    )
    const payload = await res.json()
    expect(res.status()).toBe(200)
    const found = payload.budgets?.find((b: { id: string }) => b.id === budgetId)
    expect(found).toBeFalsy()
  })
})
