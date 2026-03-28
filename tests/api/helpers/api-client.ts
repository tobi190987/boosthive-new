import { APIRequestContext } from '@playwright/test'

export function rootUrl(path = '/') {
  return `http://localhost:3000${path}`
}

export function tenantUrl(slug: string, path = '/') {
  return `http://${slug}.localhost:3000${path}`
}

/**
 * Makes a GET request to a root (owner) API endpoint with optional auth cookies.
 */
export async function ownerGet(
  request: APIRequestContext,
  path: string,
  cookies?: string
) {
  return request.get(rootUrl(path), {
    headers: {
      cookie: `bh_preview_access=granted${cookies ? `; ${cookies}` : ''}`,
    },
  })
}

/**
 * Makes a POST request to a root (owner) API endpoint.
 */
export async function ownerPost(
  request: APIRequestContext,
  path: string,
  data?: unknown,
  cookies?: string
) {
  return request.post(rootUrl(path), {
    headers: {
      'content-type': 'application/json',
      cookie: `bh_preview_access=granted${cookies ? `; ${cookies}` : ''}`,
    },
    ...(data !== undefined ? { data } : {}),
  })
}

/**
 * Makes a GET request to a tenant API endpoint with the tenant's x-tenant-id header.
 */
export async function tenantGet(
  request: APIRequestContext,
  slug: string,
  path: string,
  tenantId: string,
  cookies?: string
) {
  return request.get(tenantUrl(slug, path), {
    headers: {
      'x-tenant-id': tenantId,
      cookie: `bh_preview_access=granted${cookies ? `; ${cookies}` : ''}`,
    },
  })
}

/**
 * Makes a POST request to a tenant API endpoint.
 */
export async function tenantPost(
  request: APIRequestContext,
  slug: string,
  path: string,
  tenantId: string,
  data?: unknown,
  cookies?: string
) {
  return request.post(tenantUrl(slug, path), {
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
      cookie: `bh_preview_access=granted${cookies ? `; ${cookies}` : ''}`,
    },
    ...(data !== undefined ? { data } : {}),
  })
}

/**
 * Makes a DELETE request to a tenant API endpoint.
 */
export async function tenantDelete(
  request: APIRequestContext,
  slug: string,
  path: string,
  tenantId: string,
  cookies?: string
) {
  return request.delete(tenantUrl(slug, path), {
    headers: {
      'x-tenant-id': tenantId,
      cookie: `bh_preview_access=granted${cookies ? `; ${cookies}` : ''}`,
    },
  })
}

/**
 * Makes a PATCH request to a tenant API endpoint.
 */
export async function tenantPatch(
  request: APIRequestContext,
  slug: string,
  path: string,
  tenantId: string,
  data?: unknown,
  cookies?: string
) {
  return request.patch(tenantUrl(slug, path), {
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
      cookie: `bh_preview_access=granted${cookies ? `; ${cookies}` : ''}`,
    },
    ...(data !== undefined ? { data } : {}),
  })
}

/**
 * Logs in a user and returns the auth cookies from the Set-Cookie response header.
 */
export async function loginAndGetCookies(
  request: APIRequestContext,
  slug: string,
  email: string,
  password: string,
  options: { ownerLogin?: boolean } = {}
): Promise<string> {
  const url = options.ownerLogin
    ? rootUrl('/api/auth/owner/login')
    : tenantUrl(slug, '/api/auth/login')

  const response = await request.post(url, {
    headers: {
      'content-type': 'application/json',
      origin: options.ownerLogin
        ? 'http://localhost:3000'
        : `http://${slug}.localhost:3000`,
      cookie: 'bh_preview_access=granted',
    },
    data: { email, password },
  })

  if (!response.ok()) {
    throw new Error(
      `Login fehlgeschlagen (${response.status()}): ${await response.text()}`
    )
  }

  // Collect all Set-Cookie headers into a single cookie string
  const setCookieHeaders = response.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie')
  const cookies = setCookieHeaders
    .map(h => h.value.split(';')[0]) // extract "name=value" part
    .join('; ')

  return cookies
}
