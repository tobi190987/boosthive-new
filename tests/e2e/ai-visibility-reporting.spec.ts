import { expect, test } from '@playwright/test'
import { loginAsTenant, tenantUrl } from './helpers'
import {
  createAdminClientForTests,
  completeTenantOnboarding,
  seedVisibilityReportingData,
} from './seed-data'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

test.describe('ai visibility reporting flows', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  const slug = 'e2e-ai-report'
  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, slug, { billingOnboardingCompleted: true })
    const admin = createAdminClientForTests()
    await completeTenantOnboarding(admin, seed)
    await seedVisibilityReportingData(admin, seed.tenant.id)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, slug)
  })

  test('member can open report, inspect insights, update recommendation and export pdf', async ({
    page,
  }) => {
    await loginAsTenant(page, seed.tenant.slug, seed.users.member.email, seed.users.member.password)
    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/dashboard'), { timeout: 20_000 })

    await page.goto(tenantUrl(seed.tenant.slug, '/tools/ai-visibility'))
    await expect(page.getByRole('heading', { name: 'Analyse-Projekte' })).toBeVisible()

    await page.getByRole('button', { name: /Projekt Acme AI/ }).click()
    await expect(page.getByRole('heading', { name: 'Acme AI' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'AI Visibility Report' })).toBeVisible()
    await expect(page.getByText('Ausbau der GEO-Landingpage', { exact: true })).toBeVisible()

    await expect(page.getByText('Brand-SOM')).toBeVisible()
    await expect(page.getByText('Benchmark-Matrix', { exact: true })).toBeVisible()
    await expect(page.getByText('GEO-Empfehlungen', { exact: true })).toBeVisible()
    await expect(page.getByText('Source Attribution', { exact: true })).toBeVisible()
    await expect(page.getByText('competitor-gap.test')).toBeVisible()

    await page.getByRole('tab', { name: 'GPT-4o' }).click()
    await expect(page.getByText('Beta Search liegt vor der Brand.')).toBeVisible()

    const recommendationButton = page.getByRole('button', { name: 'Als erledigt markieren' }).first()
    await recommendationButton.click()
    await expect(page.getByRole('button', { name: 'Erledigt' }).first()).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PDF exportieren' }).click(),
    ])

    expect(await download.suggestedFilename()).toMatch(/^Acme AI-AI-Visibility-Report-.*\.pdf$/)
  })
})
