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
