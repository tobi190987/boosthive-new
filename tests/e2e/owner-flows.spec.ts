import { expect, test } from '@playwright/test'
import { completeMemberOnboarding, loginAsOwner, rootUrl } from './helpers'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

const OWNER_SLUG = 'e2e-owner-base'
const CREATED_SLUG = 'e2e-owner-created'
const CREATED_NAME = 'Owner Created Studio'
const REPLACEMENT_ADMIN_EMAIL = `invitee+${CREATED_SLUG}@example.com`

test.describe('owner flows', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let ownerSeed: SeedResult

  test.beforeAll(async ({ request }) => {
    ownerSeed = await seedTenant(request, OWNER_SLUG)
    await cleanupTenant(request, CREATED_SLUG)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, CREATED_SLUG)
    await cleanupTenant(request, OWNER_SLUG)
  })

  test('owner can create, pause, resume and reassign a tenant admin', async ({ page }) => {
    await loginAsOwner(page, ownerSeed.users.owner.email, ownerSeed.users.owner.password)
    await expect(page).toHaveURL(rootUrl('/owner/dashboard'), { timeout: 20_000 })
    await expect(page.getByText('Systemweite Tenant-Übersicht für BoostHive')).toBeVisible()

    await page.getByRole('link', { name: 'Neuer Tenant' }).click()
    await expect(page).toHaveURL(rootUrl('/owner/tenants/new'), { timeout: 20_000 })

    await page.getByLabel('Agentur-Name').fill(CREATED_NAME)
    await page.getByLabel('Subdomain-Slug').fill(CREATED_SLUG)
    await page.getByLabel('Admin-E-Mail').fill(`admin+${CREATED_SLUG}@example.com`)
    await page.waitForLoadState('networkidle')
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/owner/tenants') && response.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Agentur erstellen' }).click(),
    ])

    await expect(page).toHaveURL(rootUrl('/owner/tenants'), { timeout: 20_000 })
    const createdRow = page.locator('tr', {
      has: page.getByRole('link', { name: CREATED_NAME }),
    })
    await expect(createdRow).toBeVisible()
    await expect(createdRow.getByText(`${CREATED_SLUG}.boost-hive.de`)).toBeVisible()
    await expect(createdRow.getByText('Aktiv')).toBeVisible()

    await createdRow.getByRole('button', { name: `Aktionen für ${CREATED_NAME}` }).click()
    await page.getByRole('menuitem', { name: 'Pausieren' }).click()
    await page.getByRole('button', { name: 'Pausieren' }).click()
    await expect(createdRow.getByText('Pausiert')).toBeVisible()

    await createdRow.getByRole('button', { name: `Aktionen für ${CREATED_NAME}` }).click()
    await page.getByRole('menuitem', { name: 'Fortsetzen' }).click()
    await page.getByRole('button', { name: 'Fortsetzen' }).click()
    await expect(createdRow.getByText('Aktiv')).toBeVisible()

    await createdRow.getByRole('link', { name: CREATED_NAME }).click()
    await expect(page).toHaveURL(/\/owner\/tenants\/[0-9a-f-]+$/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: CREATED_NAME })).toBeVisible()

    await page.getByRole('tab', { name: 'Admin' }).click()
    await expect(page.getByText('Neuen Admin zuweisen')).toBeVisible()
    await page.getByLabel('Neue Admin-E-Mail').fill(REPLACEMENT_ADMIN_EMAIL)
    await page.getByRole('button', { name: 'Admin zuweisen' }).click()

    await expect(page.getByText(REPLACEMENT_ADMIN_EMAIL)).toBeVisible()
  })
})
