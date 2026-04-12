import { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const PREVIEW_ACCESS_COOKIE = 'bh_preview_access=granted'
let testIpCounter = 10

export function nextTestIp() {
  testIpCounter += 1
  return `203.0.113.${testIpCounter}`
}

export function rootUrl(path = '/') {
  return new URL(path, BASE_URL).toString()
}

export function tenantUrl(slug: string, path = '/') {
  const url = new URL(path, BASE_URL)
  url.hostname = `${slug}.${url.hostname}`
  return url.toString()
}

export function rootOrigin() {
  const url = new URL(BASE_URL)
  return url.origin
}

export function tenantOrigin(slug: string) {
  const url = new URL(BASE_URL)
  url.hostname = `${slug}.${url.hostname}`
  return url.origin
}

export function buildCookieHeader(cookies?: string) {
  return cookies ? `${PREVIEW_ACCESS_COOKIE}; ${cookies}` : PREVIEW_ACCESS_COOKIE
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
      cookie: buildCookieHeader(cookies),
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
      cookie: buildCookieHeader(cookies),
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
      cookie: buildCookieHeader(cookies),
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
      cookie: buildCookieHeader(cookies),
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
      cookie: buildCookieHeader(cookies),
    },
  })
}

/**
 * Makes a PUT request to a tenant API endpoint.
 */
export async function tenantPut(
  request: APIRequestContext,
  slug: string,
  path: string,
  tenantId: string,
  data?: unknown,
  cookies?: string
) {
  return request.put(tenantUrl(slug, path), {
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
      cookie: buildCookieHeader(cookies),
    },
    ...(data !== undefined ? { data } : {}),
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
      cookie: buildCookieHeader(cookies),
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
      origin: options.ownerLogin ? rootOrigin() : tenantOrigin(slug),
      cookie: buildCookieHeader(),
      'x-forwarded-for': nextTestIp(),
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
