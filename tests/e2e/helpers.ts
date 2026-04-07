import { Page } from '@playwright/test'

export const previewCookieName = 'bh_preview_access'

export interface E2ECustomer {
  id: string
  name: string
  domain: string | null
  status: 'active' | 'paused'
}

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
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/owner/login') &&
        response.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Anmelden' }).click(),
  ])

  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith('/owner/login'), { timeout: 10_000 }),
    page.waitForLoadState('networkidle'),
  ]).catch(() => null)

  if (page.url().includes('/owner/login')) {
    await page.waitForTimeout(500)
    const alertText = await page.getByRole('alert').textContent().catch(() => null)
    throw new Error(`Owner-Login fehlgeschlagen: ${alertText?.trim() ?? 'Unbekannter Fehler.'}`)
  }
}

export async function setActiveCustomer(page: Page, slug: string, customer: E2ECustomer) {
  await page.goto(tenantUrl(slug, '/dashboard'))
  await page.waitForLoadState('networkidle')

  await page.evaluate(
    ({ tenantSlug, nextCustomer }) => {
      localStorage.setItem(`boosthive_active_customer_${tenantSlug}`, nextCustomer.id)
      sessionStorage.setItem(
        `boosthive_customers_${tenantSlug}`,
        JSON.stringify([nextCustomer])
      )
    },
    {
      tenantSlug: slug,
      nextCustomer: customer,
    }
  )

  await page.reload()
  await page.waitForLoadState('networkidle')
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

export async function ensureTenantDashboardReady(
  page: Page,
  slug: string,
  options?: { firstName?: string; lastName?: string; tenantName?: string }
) {
  const onboardingUrl = tenantUrl(slug, '/onboarding')
  const dashboardUrl = tenantUrl(slug, '/dashboard')

  await page.waitForLoadState('networkidle')

  if (page.url() === onboardingUrl) {
    if (options?.tenantName) {
      await page.getByText(`Willkommen bei ${options.tenantName}`).waitFor({ state: 'visible' })
    }

    await completeMemberOnboarding(
      page,
      options?.firstName ?? 'Mia',
      options?.lastName ?? 'Member'
    )
  }

  await page.waitForURL((url) => url.href === dashboardUrl, { timeout: 20_000 })
  await page.getByText('Dein Workspace-Überblick für heute').waitFor({ state: 'visible' })
}
