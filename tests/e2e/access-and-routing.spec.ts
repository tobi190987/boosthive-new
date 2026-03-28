import { expect, test } from '@playwright/test'
import { grantPreviewAccess, rootUrl, tenantUrl } from './helpers'

test.describe('preview access and routing', () => {
  test('shows preview access gate without cookie', async ({ page }) => {
    await page.goto(rootUrl('/login'))

    await expect(page).toHaveURL(/\/access\?returnTo=%2Flogin$/)
    await expect(
      page.getByRole('heading', { name: 'Zugang kurz freischalten' })
    ).toBeVisible()
  })

  test('allows owner login only on root domain', async ({ page }) => {
    await grantPreviewAccess(page)
    await page.goto(rootUrl('/owner/login'))

    await expect(page).toHaveURL(rootUrl('/owner/login'))
    await expect(page.getByText('Plattform-Zugang für BoostHive Owner')).toBeVisible()
  })

  test('blocks owner login on tenant subdomains', async ({ page }) => {
    await grantPreviewAccess(page, 'tenant-a')
    const response = await page.goto(tenantUrl('tenant-a', '/owner/login'))

    expect(response?.status()).toBe(404)
    await expect(page.getByText('Not Found')).toBeVisible()
  })

  test('redirects protected tenant routes to tenant login', async ({ page }) => {
    await grantPreviewAccess(page, 'tenant-a')
    await page.goto(tenantUrl('tenant-a', '/dashboard'))

    await expect(page).toHaveURL(tenantUrl('tenant-a', '/login?returnTo=%2Fdashboard'))
    await expect(page.getByText('Tenant: tenant-a')).toBeVisible()
  })
})
