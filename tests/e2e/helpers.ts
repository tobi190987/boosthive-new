import { Page } from '@playwright/test'

export const previewCookieName = 'bh_preview_access'

export function rootUrl(path = '/') {
  return `http://localhost:3000${path}`
}

export function tenantUrl(slug: string, path = '/') {
  return `http://${slug}.localhost:3000${path}`
}

export async function grantPreviewAccess(page: Page, slug?: string) {
  const url = slug ? tenantUrl(slug) : rootUrl()

  await page.context().addCookies([
    {
      name: previewCookieName,
      value: 'granted',
      url,
    },
  ])
}

export async function loginAsTenant(page: Page, slug: string, email: string, password: string) {
  await grantPreviewAccess(page, slug)
  await page.goto(tenantUrl(slug, '/login'))
  await page.getByLabel('E-Mail').fill(email)
  await page.locator('input#password').fill(password)
  await page.getByRole('button', { name: 'Anmelden' }).click()
}

export async function loginAsOwner(page: Page, email: string, password: string) {
  await grantPreviewAccess(page)
  await page.goto(rootUrl('/owner/login'))
  await page.getByLabel('E-Mail').fill(email)
  await page.locator('input#password').fill(password)
  await page.getByRole('button', { name: 'Anmelden' }).click()

  await page.waitForLoadState('networkidle')

  if (page.url().includes('/owner/login')) {
    const alertText = await page.getByRole('alert').textContent().catch(() => null)
    throw new Error(`Owner-Login fehlgeschlagen: ${alertText?.trim() ?? 'Unbekannter Fehler.'}`)
  }
}

export async function completeMemberOnboarding(page: Page, firstName = 'Mia', lastName = 'Member') {
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Vorname').fill(firstName)
  await page.getByLabel('Nachname').fill(lastName)
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/tenant/profile') && response.request().method() === 'PUT'
    ),
    page.getByRole('button', { name: 'Onboarding abschliessen' }).click(),
  ])
}
