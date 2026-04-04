import { expect, test } from '@playwright/test'
import { tenantGet, tenantPost } from './helpers/api-client'
import { cleanupTestSessions, setupTestSessions, type TestSessions } from './helpers/fixtures'

test.describe('ad generator api smoke', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('member can generate ads, load history/detail and export xlsx', async ({ request }) => {
    const product = `API E2E ${Date.now()}`

    const generateResponse = await tenantPost(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/ad-generator/generate',
      sessions.tenantASeed.tenant.id,
      {
        briefing: {
          product,
          audience: 'Marketing Leads',
          goal: 'conversion',
          usp: 'Schnelle Umsetzung',
          tone: 'professional',
          platforms: ['facebook'],
          categories: 'both',
          selectedAdTypes: [{ platformId: 'facebook', adTypeId: 'fb_feed' }],
        },
        customerId: null,
      },
      sessions.tenantAMemberCookies
    )

    const generatePayload = await generateResponse.json()
    expect(
      generateResponse.status(),
      `generate failed with body: ${JSON.stringify(generatePayload)}`
    ).toBe(200)
    expect(typeof generatePayload.id).toBe('string')
    expect(generatePayload.id.length).toBeGreaterThan(10)
    expect(generatePayload.result?.facebook?.fb_feed?.variants?.length).toBe(3)

    const generationId = generatePayload.id as string

    const historyResponse = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/ad-generator/history',
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(historyResponse.status()).toBe(200)

    const historyPayload = await historyResponse.json()
    expect(Array.isArray(historyPayload.generations)).toBeTruthy()
    const createdEntry = historyPayload.generations.find((entry: { id: string }) => entry.id === generationId)
    expect(createdEntry).toBeTruthy()
    expect(createdEntry.product).toBe(product)

    const detailResponse = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/ad-generator/${generationId}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(detailResponse.status()).toBe(200)

    const detailPayload = await detailResponse.json()
    expect(detailPayload.generation?.id).toBe(generationId)
    expect(detailPayload.generation?.briefing?.product).toBe(product)
    expect(detailPayload.generation?.status).toBe('completed')

    const exportResponse = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/ad-generator/${generationId}/export`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(exportResponse.status()).toBe(200)
    expect(exportResponse.headers()['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(exportResponse.headers()['content-disposition']).toContain('ads_')
  })
})
