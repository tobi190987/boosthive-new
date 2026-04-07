import { expect, test } from '@playwright/test'
import { grantPreviewAccess, tenantUrl } from './helpers'

test.describe('tenant auth pages', () => {
  test.beforeEach(async ({ page }) => {
    await grantPreviewAccess(page, 'tenant-a')
  })

  test('renders tenant-aware login page', async ({ page }) => {
    await page.goto(tenantUrl('tenant-a', '/login'))

    await expect(page.getByText('Willkommen zurück')).toBeVisible()
    await expect(
      page.getByText('Melde dich an, um direkt in deinen Workspace zu wechseln.')
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Passwort vergessen?' }).first()
    ).toBeVisible()
  })

  test('renders tenant-aware forgot-password page', async ({ page }) => {
    await page.goto(tenantUrl('tenant-a', '/forgot-password'))

    await expect(page.getByText('Passwort vergessen?')).toBeVisible()
    await expect(
      page.getByText('Falls ein passender Zugang in diesem Tenant existiert')
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Zur Anmeldung' })).toBeVisible()
  })

  test('renders reset-password recovery state without token', async ({ page }) => {
    await page.goto(tenantUrl('tenant-a', '/reset-password'))

    await expect(page.getByText('Passwort neu setzen')).toBeVisible()
    await expect(page.getByText('Im Link fehlt ein gültiges Reset-Token.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Neuen Link anfordern' })).toBeVisible()
  })

  test('keeps tenant context separate per subdomain', async ({ browser }) => {
    const pageA = await browser.newPage()
    const pageB = await browser.newPage()

    await grantPreviewAccess(pageA, 'tenant-a')
    await grantPreviewAccess(pageB, 'tenant-b')

    await pageA.goto(tenantUrl('tenant-a', '/login'))
    await pageB.goto(tenantUrl('tenant-b', '/login'))

    await expect(pageA.getByText('Willkommen zurück')).toBeVisible()
    await expect(pageB.getByText('Willkommen zurück')).toBeVisible()
    await expect(pageA.getByAltText('tenant-a Logo')).toBeVisible()
    await expect(pageB.getByAltText('tenant-b Logo')).toBeVisible()
    await expect(pageA.getByAltText('tenant-b Logo')).toHaveCount(0)
    await expect(pageB.getByAltText('tenant-a Logo')).toHaveCount(0)

    await pageA.close()
    await pageB.close()
  })
})
