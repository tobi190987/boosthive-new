import { expect, test } from '@playwright/test'
import { loginAsTenant, setActiveCustomer, tenantUrl, type E2ECustomer } from './helpers'
import {
  createAdminClientForTests,
  activateTenantModule,
  completeTenantOnboarding,
  seedCustomer,
} from './seed-data'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

test.describe('keyword projects flows', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  const slug = 'e2e-keywords'
  let seed: SeedResult
  let customer: E2ECustomer

  test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(90_000)
    seed = await seedTenant(request, slug, { billingOnboardingCompleted: true })
    const admin = createAdminClientForTests()
    await completeTenantOnboarding(admin, seed)
    await activateTenantModule(admin, seed.tenant.id, 'seo_analyse')
    customer = await seedCustomer(admin, seed, {
      name: 'Kunde Nord',
      domain: 'kunde-nord.de',
    })
  })

  test.afterAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(90_000)
    await cleanupTenant(request, slug)
  })

  test('admin can create, manage and delete a keyword project', async ({ page }) => {
    await loginAsTenant(page, seed.tenant.slug, seed.users.admin.email, seed.users.admin.password)
    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/dashboard'), { timeout: 20_000 })
    await setActiveCustomer(page, seed.tenant.slug, customer)

    await page.goto(tenantUrl(seed.tenant.slug, '/tools/keywords'))
    await expect(page.getByRole('heading', { name: 'Keywordranking' })).toBeVisible()

    await page.getByRole('button', { name: 'Erstes Projekt erstellen' }).click()
    await page.getByLabel('Projektname').fill('Kunde Nord SEO')
    await page.getByLabel('Ziel-Domain').fill('https://www.kunde-nord.de/')
    await page.getByRole('button', { name: 'Erstellen' }).click()

    const projectButton = page.getByRole('button', { name: 'Projekt Kunde Nord SEO öffnen' })
    await expect(projectButton).toBeVisible()
    await expect(projectButton.getByText('kunde-nord.de')).toBeVisible()

    await projectButton.click()
    await expect(page.getByRole('heading', { name: 'Kunde Nord SEO' })).toBeVisible()

    await page.getByRole('tab', { name: 'Keywords' }).click()
    await page.getByLabel('Neues Keyword').fill('seo agentur hamburg')
    await page.getByLabel('Neues Keyword').press('Enter')
    await expect(page.getByText('"seo agentur hamburg" wurde gespeichert.', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Wettbewerber' }).click()
    await page.getByLabel('Neue Wettbewerber-Domain').fill('konkurrent.de')
    await page.getByLabel('Neue Wettbewerber-Domain').press('Enter')
    await expect(page.getByRole('tabpanel', { name: 'Wettbewerber' }).getByText('konkurrent.de')).toBeVisible()

    await page.getByRole('tab', { name: 'Einstellungen' }).click()
    const renameInput = page.getByLabel('Projektname ändern')
    await renameInput.fill('Kunde Nord SEO Plus')
    await page.getByRole('button', { name: 'Speichern' }).first().click()
    await expect(page.getByRole('heading', { name: 'Kunde Nord SEO Plus' })).toBeVisible()

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/tenant/keywords/projects/') &&
          response.request().method() === 'PATCH'
      ),
      page.getByRole('button', { name: 'Deaktivieren' }).click(),
    ])
    await expect(page.getByText('Projekt deaktiviert')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Aktivieren' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Löschen' }).click()
    await expect(page.getByRole('heading', { name: 'Projekt löschen?' })).toBeVisible()
    await page.getByRole('button', { name: 'Endgültig löschen' }).click()

    await expect(page.getByRole('heading', { name: 'Keywordranking' })).toBeVisible()
    await expect(page.getByText('Noch keine Projekte')).toBeVisible()
  })
})
