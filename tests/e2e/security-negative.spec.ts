import { expect, test } from '@playwright/test'
import {
  completeMemberOnboarding,
  grantPreviewAccess,
  loginAsOwner,
  loginAsTenant,
  rootUrl,
  tenantUrl,
} from './helpers'
import {
  cleanupTenant,
  createInvitationToken,
  createPasswordResetToken,
  seedTenant,
  type SeedResult,
} from './test-seed'

const TENANT_A = 'e2e-security-a'
const TENANT_B = 'e2e-security-b'

test.describe('security and tenant isolation regressions', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let tenantASeed: SeedResult
  let tenantBSeed: SeedResult

  test.beforeAll(async ({ request }) => {
    tenantASeed = await seedTenant(request, TENANT_A)
    tenantBSeed = await seedTenant(request, TENANT_B)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, TENANT_A)
    await cleanupTenant(request, TENANT_B)
  })

  test('member cannot access admin-only tenant pages after onboarding', async ({ page }) => {
    await loginAsTenant(
      page,
      tenantASeed.tenant.slug,
      tenantASeed.users.member.email,
      tenantASeed.users.member.password
    )
    await expect(page).toHaveURL(tenantUrl(tenantASeed.tenant.slug, '/onboarding'), {
      timeout: 20_000,
    })
    await completeMemberOnboarding(page, 'Nina', 'Member')
    await expect(page).toHaveURL(tenantUrl(tenantASeed.tenant.slug, '/dashboard'), {
      timeout: 20_000,
    })

    await page.goto(tenantUrl(tenantASeed.tenant.slug, '/settings/team'))
    await expect(page).not.toHaveURL(tenantUrl(tenantASeed.tenant.slug, '/settings/team'))
    await expect(page.getByText('Willkommen in deinem Tenant-Workspace')).toBeVisible()

    await page.goto(tenantUrl(tenantASeed.tenant.slug, '/billing'))
    await expect(page).not.toHaveURL(tenantUrl(tenantASeed.tenant.slug, '/billing'))
    await expect(page.getByText('Willkommen in deinem Tenant-Workspace')).toBeVisible()
  })

  test('wrong-tenant credentials are rejected with a generic login error', async ({ page }) => {
    await grantPreviewAccess(page, tenantBSeed.tenant.slug)
    await page.goto(tenantUrl(tenantBSeed.tenant.slug, '/login'))

    await page.getByLabel('E-Mail').fill(tenantASeed.users.member.email)
    await page.locator('input#password').fill(tenantASeed.users.member.password)
    await page.getByRole('button', { name: 'Anmelden' }).click()

    await expect(page.getByText('Ungültige Zugangsdaten.')).toBeVisible()
    await expect(page).toHaveURL(tenantUrl(tenantBSeed.tenant.slug, '/login'))
  })

  test('invitation tokens cannot be replayed on a different tenant', async ({ page, request }) => {
    const invitation = await createInvitationToken(request, tenantASeed.tenant.slug, 'member')

    await grantPreviewAccess(page, tenantBSeed.tenant.slug)
    await page.goto(tenantUrl(tenantBSeed.tenant.slug, `/accept-invite?token=${invitation.invitation.token}`))

    await expect(
      page.getByText('Einladung fehlt oder ist unvollständig. Bitte fordere einen neuen Link an.')
    ).toBeVisible()
  })

  test('password reset tokens cannot be used on a different tenant', async ({ page, request }) => {
    const reset = await createPasswordResetToken(request, tenantASeed.tenant.slug, 'member')

    await grantPreviewAccess(page, tenantBSeed.tenant.slug)
    await page.goto(tenantUrl(tenantBSeed.tenant.slug, `/reset-password?token=${reset.reset.token}`))

    await page.locator('input#password').fill('WrongTenant123!')
    await page.locator('input#confirmPassword').fill('WrongTenant123!')
    await page.getByRole('button', { name: 'Passwort zurücksetzen' }).click()

    await expect(
      page.getByText('Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Reset-Link an.')
    ).toBeVisible()
  })

  test('inactive tenants reject new tenant logins', async ({ page, request }) => {
    await loginAsOwner(page, tenantASeed.users.owner.email, tenantASeed.users.owner.password)
    await expect(page).toHaveURL(rootUrl('/owner/dashboard'), { timeout: 20_000 })

    await page.goto(rootUrl('/owner/tenants'))
    const tenantRow = page.locator('tr', {
      has: page.getByRole('link', { name: tenantASeed.tenant.name }),
    })
    await tenantRow.getByRole('button', { name: `Aktionen für ${tenantASeed.tenant.name}` }).click()
    await page.getByRole('menuitem', { name: 'Pausieren' }).click()
    await page.getByRole('button', { name: 'Pausieren' }).click()
    await expect(tenantRow.getByText('Pausiert')).toBeVisible()

    const loginResponse = await request.post(tenantUrl(tenantASeed.tenant.slug, '/api/auth/login'), {
      headers: {
        'content-type': 'application/json',
        origin: `http://${tenantASeed.tenant.slug}.localhost:3000`,
        cookie: 'bh_preview_access=granted',
      },
      data: {
        email: tenantASeed.users.admin.email,
        password: tenantASeed.users.admin.password,
      },
    })

    expect(loginResponse.status()).toBe(401)
    await expect(loginResponse.json()).resolves.toMatchObject({
      error: 'Ungültige Zugangsdaten.',
    })
  })
})
