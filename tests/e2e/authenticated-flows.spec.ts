import { expect, test } from '@playwright/test'
import { completeMemberOnboarding, grantPreviewAccess, tenantUrl } from './helpers'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

test.describe('authenticated tenant flows', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, 'e2e-flow')
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, 'e2e-flow')
  })

  test('member login redirects into onboarding and can complete it', async ({ page }) => {
    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, '/login'))

    await page.getByLabel('E-Mail').fill(seed.users.member.email)
    await page.locator('input#password').fill(seed.users.member.password)
    await page.getByRole('button', { name: 'Anmelden' }).click()

    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/onboarding'), { timeout: 20_000 })
    await expect(page.getByText(`Willkommen bei ${seed.tenant.name}`)).toBeVisible()

    await completeMemberOnboarding(page, 'Mia', 'Member')

    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/dashboard'), { timeout: 20_000 })
    await expect(page.getByText('Willkommen in deinem Tenant-Workspace')).toBeVisible()
  })

  test('admin onboarding exposes billing requirements and country dropdown', async ({ page, request }) => {
    seed = await seedTenant(request, 'e2e-flow')

    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, '/login'))

    await page.getByLabel('E-Mail').fill(seed.users.admin.email)
    await page.locator('input#password').fill(seed.users.admin.password)
    await page.getByRole('button', { name: 'Anmelden' }).click()

    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/onboarding'), { timeout: 20_000 })
    await expect(
      page.getByText('Rechnungsdaten sind für Admins Pflichtfelder und werden benötigt')
    ).toBeVisible()

    const countryTrigger = page.locator('#billing_country')
    await expect(countryTrigger).toContainText('Land auswählen')
    await expect(page.getByRole('combobox', { name: 'Land Pflichtfeld' })).toBeVisible()

    await page.waitForLoadState('networkidle')
    await page.getByLabel('Vorname').fill('Ada')
    await page.getByLabel('Nachname').fill('Admin')
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/tenant/profile') && response.request().method() === 'PUT'
      ),
      page.getByRole('button', { name: 'Onboarding abschliessen' }).click(),
    ])

    await expect(
      page.getByText('Bitte hinterlege eine vollständige Rechnungsadresse.')
    ).toBeVisible()
  })
})
