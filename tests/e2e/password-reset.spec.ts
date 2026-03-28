import { expect, test } from '@playwright/test'
import { grantPreviewAccess, tenantUrl } from './helpers'
import {
  cleanupTenant,
  createPasswordResetToken,
  seedTenant,
  type SeedResult,
} from './test-seed'

test.describe('forgot password and reset flow', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, 'e2e-reset')
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, 'e2e-reset')
  })

  test('forgot-password responds with generic success for unknown email', async ({ page }) => {
    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, '/forgot-password'))

    await page.getByLabel('E-Mail').fill('unknown+e2e-reset@example.com')
    await page.getByRole('button', { name: 'Reset-Link anfordern' }).click()

    await expect(
      page.getByText(
        'Wenn ein passendes Konto in diesem Tenant existiert, wurde eine E-Mail mit weiteren Schritten versendet.'
      ),
      { timeout: 20_000 }
    ).toBeVisible()
  })

  test('forgot-password responds with same success for existing email', async ({ page }) => {
    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, '/forgot-password'))

    await page.getByLabel('E-Mail').fill(seed.users.member.email)
    await page.getByRole('button', { name: 'Reset-Link anfordern' }).click()

    await expect(
      page.getByText(
        'Wenn ein passendes Konto in diesem Tenant existiert, wurde eine E-Mail mit weiteren Schritten versendet.'
      ),
      { timeout: 20_000 }
    ).toBeVisible()
  })

  test('reset-password accepts a valid token and redirects into onboarding', async ({
    page,
    request,
  }) => {
    const reset = await createPasswordResetToken(request, seed.tenant.slug, 'member')

    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, `/reset-password?token=${reset.reset.token}`))

    await page.locator('input#password').fill('ResetFlow123!')
    await page.locator('input#confirmPassword').fill('ResetFlow123!')
    await page.getByRole('button', { name: 'Passwort zurücksetzen' }).click()

    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/onboarding'), { timeout: 20_000 })
    await expect(page.getByText(`Willkommen bei ${seed.tenant.name}`)).toBeVisible()
    await expect(page.getByText(reset.reset.email)).toBeVisible()
  })

  test('reset-password shows a clear error for invalid tokens', async ({ page }) => {
    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, '/reset-password?token=invalid-token'))

    await page.locator('input#password').fill('ResetFlow123!')
    await page.locator('input#confirmPassword').fill('ResetFlow123!')
    await page.getByRole('button', { name: 'Passwort zurücksetzen' }).click()

    await expect(
      page.getByText('Validierungsfehler.')
    ).toBeVisible()
  })
})
