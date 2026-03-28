import { expect, test } from '@playwright/test'
import { loginAsOwner, rootUrl } from './helpers'
import { cleanupTenant, seedTenant, type SeedResult } from './test-seed'

const AUDIT_SLUG = 'e2e-owner-audit'
const UPDATED_NAME = 'Owner Audit Studio'
const REASSIGNED_ADMIN_EMAIL = `invitee+${AUDIT_SLUG}@example.com`

test.describe('owner audit log', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let auditSeed: SeedResult

  test.beforeAll(async ({ request }) => {
    auditSeed = await seedTenant(request, AUDIT_SLUG, {
      billingOnboardingCompleted: true,
      subscriptionStatus: 'active',
    })
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, AUDIT_SLUG)
  })

  test('records and shows owner audit events in tenant detail history', async ({ page }) => {
    await loginAsOwner(page, auditSeed.users.owner.email, auditSeed.users.owner.password)
    await expect(page).toHaveURL(rootUrl('/owner/dashboard'), { timeout: 20_000 })

    await page.goto(rootUrl(`/owner/tenants/${auditSeed.tenant.id}`))
    await expect(page.getByRole('heading', { name: auditSeed.tenant.name })).toBeVisible({
      timeout: 20_000,
    })

    const basicsPatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}`) &&
        response.request().method() === 'PATCH'
    )
    const detailReloadPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}`) &&
        response.request().method() === 'GET'
    )
    await page.getByLabel('Agentur-Name').fill(UPDATED_NAME)
    await page.getByRole('button', { name: 'Allgemein speichern' }).click()
    await basicsPatchPromise
    await detailReloadPromise
    await expect(page.getByRole('heading', { name: UPDATED_NAME })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('tab', { name: 'Kontakt' }).click()
    const contactPatchPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}`) &&
        response.request().method() === 'PATCH'
    )
    const contactReloadPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}`) &&
        response.request().method() === 'GET'
    )
    await page.getByLabel('Ansprechpartner').fill('Audit Owner')
    await page.getByLabel('Telefon').fill('+49 30 123456')
    await page.getByLabel('Website').fill('https://audit.example.com')
    await page.getByRole('button', { name: 'Kontakt speichern' }).click()
    await contactPatchPromise
    await contactReloadPromise

    await page.getByRole('tab', { name: 'Admin' }).click()
    const adminPostPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}/admin`) &&
        response.request().method() === 'POST'
    )
    const adminReloadPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}`) &&
        response.request().method() === 'GET'
    )
    await page.getByLabel('Neue Admin-E-Mail').fill(REASSIGNED_ADMIN_EMAIL)
    await page.getByRole('button', { name: 'Admin zuweisen' }).click()
    await adminPostPromise
    await adminReloadPromise
    await expect(page.getByText(REASSIGNED_ADMIN_EMAIL)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('tab', { name: 'User' }).click()
    const deleteUserPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}/users/`) &&
        response.request().method() === 'DELETE'
    )
    const usersReloadPromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/owner/tenants/${auditSeed.tenant.id}`) &&
        response.request().method() === 'GET'
    )
    await page.getByLabel(`User ${auditSeed.users.member.email} löschen`).click()
    await page.getByRole('button', { name: 'User löschen' }).click()
    await deleteUserPromise
    await usersReloadPromise
    await expect(page.getByText(auditSeed.users.member.email)).not.toBeVisible()

    await page.getByRole('tab', { name: 'Historie' }).click()
    await expect(page.getByText('Owner-Historie')).toBeVisible()
    await expect(page.getByText('Basisdaten aktualisiert')).toBeVisible()
    await expect(page.getByText('Kontaktdaten aktualisiert')).toBeVisible()
    await expect(page.getByText('Admin neu zugewiesen')).toBeVisible()
    await expect(page.getByText('User entfernt')).toBeVisible()
    await expect(page.getByText(`Name: ${UPDATED_NAME}`)).toBeVisible()
    await expect(page.getByText(`Neuer Admin: ${REASSIGNED_ADMIN_EMAIL}`)).toBeVisible()
  })
})
