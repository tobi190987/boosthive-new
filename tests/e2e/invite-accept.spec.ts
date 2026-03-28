import { expect, test } from '@playwright/test'
import { grantPreviewAccess, tenantUrl } from './helpers'
import { cleanupTenant, createInvitationToken, seedTenant, type SeedResult } from './test-seed'

test.describe('invite accept flow', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let seed: SeedResult

  test.beforeAll(async ({ request }) => {
    seed = await seedTenant(request, 'e2e-invite')
  })

  test.afterAll(async ({ request }) => {
    await cleanupTenant(request, 'e2e-invite')
  })

  test('accepts a member invitation and redirects into onboarding', async ({ page, request }) => {
    const invitation = await createInvitationToken(request, seed.tenant.slug, 'member')

    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, `/accept-invite?token=${invitation.invitation.token}`))

    await expect(page.getByText(`Einladung für ${invitation.invitation.email}`)).toBeVisible()
    await page.locator('input#password').fill('InviteFlow123!')
    await page.getByRole('button', { name: 'Einladung annehmen' }).click()

    await expect(page).toHaveURL(tenantUrl(seed.tenant.slug, '/onboarding'), { timeout: 20_000 })
    await expect(page.getByText(`Willkommen bei ${seed.tenant.name}`)).toBeVisible()
    await expect(page.getByText(invitation.invitation.email)).toBeVisible()
  })

  test('rejects an invalid invitation token with a clear message', async ({ page }) => {
    await grantPreviewAccess(page, seed.tenant.slug)
    await page.goto(tenantUrl(seed.tenant.slug, '/accept-invite?token=invalid-token'))

    await expect(
      page.getByText('Einladung fehlt oder ist unvollständig. Bitte fordere einen neuen Link an.')
    ).toBeVisible()
  })
})
