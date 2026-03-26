import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'boost-hive.de'
const LOCAL_DOMAIN = process.env.LOCAL_DOMAIN || 'localhost'
const IS_LOCAL = process.env.NODE_ENV === 'development'

// Fallback tenant slug used when running on *.localhost in dev mode
const LOCAL_FALLBACK_TENANT_SLUG = 'test-tenant'

// Subdomain validation: 3-63 chars, lowercase alphanumeric + hyphens
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/

// ---------------------------------------------------------------------------
// In-Memory Tenant Cache (60s TTL)
// ---------------------------------------------------------------------------

interface CachedTenant {
  id: string
  slug: string
  status: 'active' | 'inactive'
  cachedAt: number
}

const CACHE_TTL_MS = 60_000 // 60 seconds
const tenantCache = new Map<string, CachedTenant>()

function getCachedTenant(slug: string): CachedTenant | null {
  const entry = tenantCache.get(slug)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    tenantCache.delete(slug)
    return null
  }
  return entry
}

function setCachedTenant(tenant: CachedTenant): void {
  tenantCache.set(tenant.slug, { ...tenant, cachedAt: Date.now() })
}

// ---------------------------------------------------------------------------
// Supabase client for proxy (lightweight, no cookies needed)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ---------------------------------------------------------------------------
// Subdomain Extraction
// ---------------------------------------------------------------------------

function extractSubdomain(host: string): string | null {
  // Remove port if present
  const hostname = host.split(':')[0]

  // Local development: agentur-x.localhost -> "agentur-x"
  if (IS_LOCAL && hostname.endsWith(`.${LOCAL_DOMAIN}`)) {
    const subdomain = hostname.replace(`.${LOCAL_DOMAIN}`, '')
    if (!subdomain) return null
    // Treat "www" as root domain (no tenant)
    if (subdomain === 'www') return null
    return subdomain
  }

  // Local development: plain localhost -> no subdomain (root domain)
  if (IS_LOCAL && hostname === LOCAL_DOMAIN) {
    return null
  }

  // Production: agentur-x.boost-hive.de -> "agentur-x"
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const subdomain = hostname.replace(`.${ROOT_DOMAIN}`, '')
    if (!subdomain) return null
    // Treat "www" as root domain (no tenant)
    if (subdomain === 'www') return null
    return subdomain
  }

  // Production: boost-hive.de -> no subdomain (root domain)
  if (hostname === ROOT_DOMAIN) {
    return null
  }

  // Unknown host — treat as root domain (no subdomain)
  return null
}

// ---------------------------------------------------------------------------
// Header Sanitization
// ---------------------------------------------------------------------------

// Tenant-related headers that MUST be controlled exclusively by this proxy.
// Any incoming values are stripped to prevent spoofing attacks (SEC-1).
const TENANT_HEADERS = ['x-tenant-id', 'x-tenant-slug']

/**
 * Returns a copy of the request headers with all tenant-related headers removed.
 * This MUST be used as the base for every response to prevent header spoofing.
 */
function sanitizedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers)
  for (const h of TENANT_HEADERS) {
    headers.delete(h)
  }
  return headers
}

// ---------------------------------------------------------------------------
// Proxy (Next.js 16 convention, replaces deprecated middleware.ts)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const subdomain = extractSubdomain(host)

  // ----- Root domain (no subdomain) → pass through to landing page -----
  if (subdomain === null) {
    // Strip any spoofed tenant headers before passing through (BUG-1 fix)
    const headers = sanitizedHeaders(request)
    return NextResponse.next({ request: { headers } })
  }

  // ----- Validate subdomain format -----
  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    return new NextResponse('Ungueltige Subdomain', { status: 400 })
  }

  // ----- Local development fallback -----
  if (IS_LOCAL) {
    // In local dev, resolve from cache/DB but fall back to test-tenant
    const tenant = await resolveTenant(subdomain)

    if (tenant === null) {
      // Use fallback for any subdomain in local dev
      const headers = sanitizedHeaders(request)
      headers.set('x-tenant-id', 'local-dev-fallback')
      headers.set('x-tenant-slug', subdomain)
      console.log(
        `[Middleware] Local dev fallback: ${subdomain} -> ${LOCAL_FALLBACK_TENANT_SLUG}`
      )
      return NextResponse.next({ request: { headers } })
    }

    // NOTE: The inactive-tenant check is handled by RLS policy
    // `tenants_select_active` which only returns tenants with status = 'active'.
    // If a tenant is inactive, `resolveTenant()` returns null (treated as 404).
    // See BUG-4 in QA report for details.

    const headers = sanitizedHeaders(request)
    headers.set('x-tenant-id', tenant.id)
    headers.set('x-tenant-slug', tenant.slug)
    return NextResponse.next({ request: { headers } })
  }

  // ----- Production: resolve tenant from DB -----
  const tenant = await resolveTenant(subdomain)

  if (tenant === null) {
    // Unknown or inactive subdomain → 404
    // NOTE: Inactive tenants are also filtered out by the RLS policy
    // `tenants_select_active` (anon key can only read active tenants).
    // Therefore this branch covers both "not found" and "inactive" cases.
    const url = request.nextUrl.clone()
    url.pathname = '/not-found'
    return NextResponse.rewrite(url, { status: 404 })
  }

  // ----- Inject tenant context as request headers -----
  const headers = sanitizedHeaders(request)
  headers.set('x-tenant-id', tenant.id)
  headers.set('x-tenant-slug', tenant.slug)

  return NextResponse.next({ request: { headers } })
}

// ---------------------------------------------------------------------------
// Tenant Resolution (DB lookup with caching)
// ---------------------------------------------------------------------------

async function resolveTenant(
  slug: string
): Promise<{ id: string; slug: string; status: 'active' | 'inactive' } | null> {
  // Check cache first
  const cached = getCachedTenant(slug)
  if (cached) {
    return cached
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('tenants')
      .select('id, slug, status')
      .eq('slug', slug)
      .single()

    if (error || !data) {
      return null
    }

    const tenant = {
      id: data.id,
      slug: data.slug,
      status: data.status as 'active' | 'inactive',
      cachedAt: Date.now(),
    }

    setCachedTenant(tenant)
    return tenant
  } catch (err) {
    console.error(`[Middleware] Tenant lookup failed for slug "${slug}":`, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Proxy Config — run on all routes except static assets
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Public files with common extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
