import { expect, test } from '@playwright/test'
import { loginAsTenant, tenantUrl } from './helpers'
import {
  createAdminClientForTests,
  activateTenantModule,
  completeTenantOnboarding,
} from './seed-data'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

test.describe('keyword projects flows', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  const slug = 'e2e-keywords'
  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, slug, { billingOnboardingCompleted: true })
    const admin = createAdminClientForTests()
    await completeTenantOnboarding(admin, seed)
    await activateTenantModule(admin, seed.tenant.id, 'seo_analyse')
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, slug)
  })

  test('admin can create, manage and delete a keyword project', async ({ page }) => {
    await loginAsTenant(page, seed.tenant.slug, seed.users.admin.email, seed.users.admin.password)
    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/dashboard'), { timeout: 20_000 })

    await page.goto(tenantUrl(seed.tenant.slug, '/tools/keywords'))
    await expect(page.getByRole('heading', { name: 'Keywordranking' })).toBeVisible()

    await page.getByRole('button', { name: 'Erstes Projekt erstellen' }).click()
    await page.getByLabel('Projektname').fill('Kunde Nord')
    await page.getByLabel('Ziel-Domain').fill('https://www.kunde-nord.de/')
    await page.getByRole('button', { name: 'Erstellen' }).click()

    await expect(page.getByRole('button', { name: 'Projekt Kunde Nord oeffnen' })).toBeVisible()
    await expect(page.getByText('kunde-nord.de')).toBeVisible()

    await page.getByRole('button', { name: 'Projekt Kunde Nord oeffnen' }).click()
    await expect(page.getByRole('heading', { name: 'Kunde Nord' })).toBeVisible()

    await page.getByLabel('Neues Keyword').fill('seo agentur hamburg')
    await page.getByLabel('Neues Keyword').press('Enter')
    await expect(page.getByText('"seo agentur hamburg" wurde gespeichert.', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Wettbewerber' }).click()
    await page.getByLabel('Neue Wettbewerber-Domain').fill('konkurrent.de')
    await page.getByRole('tabpanel', { name: 'Wettbewerber' }).getByRole('button').click()
    await expect(page.getByRole('tabpanel', { name: 'Wettbewerber' }).getByText('konkurrent.de')).toBeVisible()

    await page.getByRole('tab', { name: 'Einstellungen' }).click()
    const renameInput = page.getByLabel('Projektname aendern')
    await renameInput.fill('Kunde Nord SEO')
    await page.getByRole('button', { name: 'Speichern' }).first().click()
    await expect(page.getByRole('heading', { name: 'Kunde Nord SEO' })).toBeVisible()

    await page.getByRole('button', { name: 'Deaktivieren' }).click()
    await expect(page.getByText('Inaktiv')).toBeVisible()

    await page.getByRole('button', { name: 'Loeschen' }).click()
    await expect(page.getByRole('heading', { name: 'Projekt loeschen?' })).toBeVisible()
    await page.getByRole('button', { name: 'Endgueltig loeschen' }).click()

    await expect(page.getByRole('heading', { name: 'Keywordranking' })).toBeVisible()
    await expect(page.getByText('Noch keine Projekte')).toBeVisible()
  })
})
