import { expect, test } from '@playwright/test'
import { loginAsOwner, rootUrl } from './helpers'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

const OWNER_SLUG = 'e2e-owner-base'
const CREATED_SLUG = 'e2e-owner-created'
const CREATED_NAME = 'Owner Created Studio'
const REPLACEMENT_ADMIN_EMAIL = `invitee+${CREATED_SLUG}@example.com`

test.describe('owner flows', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let ownerSeed: SeedResult

  test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(90_000)
    ownerSeed = await seedTenant(request, OWNER_SLUG, {
      billingOnboardingCompleted: true,
      subscriptionStatus: 'active',
    })
    await cleanupTenant(request, CREATED_SLUG)
  })

  test.afterAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(90_000)
    await Promise.all([
      cleanupTenant(request, CREATED_SLUG),
      cleanupTenant(request, OWNER_SLUG),
    ])
  })

  test('owner can update profile data and sees persisted values after reload', async ({ page }) => {
    await loginAsOwner(page, ownerSeed.users.owner.email, ownerSeed.users.owner.password)
    await page.goto(rootUrl('/owner/profile'))
    await expect(page).toHaveURL(rootUrl('/owner/profile'), { timeout: 20_000 })
    await expect(page.getByText('Persönliche Daten und Profilbild')).toBeVisible()
    await expect(page.locator('#owner-first_name')).toBeVisible()

    const firstNameInput = page.locator('#owner-first_name')
    const lastNameInput = page.locator('#owner-last_name')
    const nextFirstName = 'Olivia'
    const nextLastName = 'Owner'

    await firstNameInput.fill(nextFirstName)
    await lastNameInput.fill(nextLastName)

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/owner/profile') && response.request().method() === 'PUT'
      ),
      page.getByRole('button', { name: 'Profil speichern' }).click(),
    ])

    await expect(page.getByText('Deine Profildaten wurden gespeichert.')).toBeVisible()
    await expect(firstNameInput).toHaveValue(nextFirstName)
    await expect(lastNameInput).toHaveValue(nextLastName)

    await page.reload()
    await expect(page).toHaveURL(rootUrl('/owner/profile'), { timeout: 20_000 })
    await expect(firstNameInput).toHaveValue(nextFirstName)
    await expect(lastNameInput).toHaveValue(nextLastName)
  })

  test('owner can create a tenant and reassign the tenant admin', async ({ page }) => {
    await loginAsOwner(page, ownerSeed.users.owner.email, ownerSeed.users.owner.password)
    await expect(page).toHaveURL(rootUrl('/owner/dashboard'), { timeout: 20_000 })
    await expect(page.getByText('Systemweite Tenant-Übersicht für BoostHive')).toBeVisible()

    await page.getByRole('link', { name: 'Neuer Tenant' }).click()
    await expect(page).toHaveURL(rootUrl('/owner/tenants/new'), { timeout: 20_000 })
    await page.waitForLoadState('networkidle')

    const agencyNameInput = page.getByLabel('Agentur-Name')
    const slugInput = page.getByLabel('Subdomain-Slug')
    const adminEmailInput = page.getByLabel('Admin-E-Mail')

    await agencyNameInput.fill(CREATED_NAME)
    await slugInput.fill(CREATED_SLUG)
    await adminEmailInput.fill(`admin+${CREATED_SLUG}@example.com`)

    await expect(agencyNameInput).toHaveValue(CREATED_NAME)
    await expect(slugInput).toHaveValue(CREATED_SLUG)
    await expect(adminEmailInput).toHaveValue(`admin+${CREATED_SLUG}@example.com`)

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
    await expect(createdRow).toBeVisible({ timeout: 15_000 })
    await expect(createdRow.getByText(`${CREATED_SLUG}.boost-hive.de`)).toBeVisible()
    await expect(createdRow.getByText('Setup unvollständig')).toBeVisible()

    await createdRow.getByRole('link', { name: CREATED_NAME }).click()
    await expect(page).toHaveURL(/\/owner\/tenants\/[0-9a-f-]+$/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: CREATED_NAME })).toBeVisible()

    await page.getByRole('tab', { name: 'Admin' }).click()
    await expect(page.getByText('Neuen Admin zuweisen')).toBeVisible()
    await page.getByLabel('Neue Admin-E-Mail').fill(REPLACEMENT_ADMIN_EMAIL)
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/owner/tenants/') &&
          response.url().includes('/admin') &&
          response.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Admin zuweisen' }).click(),
    ])
    await page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/`) && response.request().method() === 'GET'
    )

    await expect(page.getByText(REPLACEMENT_ADMIN_EMAIL)).toBeVisible({ timeout: 15_000 })
  })
})
