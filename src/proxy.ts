import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createMiddlewareClient } from '@/lib/supabase-middleware'
import { loadTenantStatusRecord, resolveTenantStatus } from '@/lib/tenant-status'

// ---------------------------------------------------------------------------
// BUG-2: Rate Limiting für /api/owner/* Routen
// ---------------------------------------------------------------------------
// In-Memory-Rate-Limiter pro IP + Pfad.
// WICHTIG: Funktioniert nur bei Single-Instance (lokaler Dev-Server).
// In Produktion (Vercel serverless) durch Upstash Redis ersetzen:
// https://github.com/upstash/ratelimit
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 Minute
const RATE_LIMIT_MAX_REQUESTS = 30 // max. 30 Requests pro Minute pro IP
const AUTH_RATE_LIMIT_MAX_REQUESTS = 5 // max. 5 Requests pro Minute pro IP (Auth-Routen)
// BUG-12: Maximale Map-Groesse — bei Überschreitung werden abgelaufene Eintraege bereinigt
const RATE_LIMIT_MAX_ENTRIES = 10_000

// BUG-12: Bereinigt abgelaufene Eintraege aus der Rate-Limit-Map
function pruneRateLimitMap(): void {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key)
    }
  }
}

function checkRateLimit(request: NextRequest, maxRequests = RATE_LIMIT_MAX_REQUESTS): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true
  }

  // BUG-11: In Produktion auf Vercel wird x-forwarded-for von der Edge-Network gesetzt
  // (nicht vom Client spoofbar). x-real-ip als weiterer Fallback, 'unknown' für lokale Dev.
  // Für Multi-Instance-Produktion: durch Upstash Redis ersetzen (dann echte Client-IP via Vercel).
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  const key = `${ip}:${request.nextUrl.pathname}`
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    // BUG-12: Abgelaufene Eintraege bereinigen, wenn Map zu gross wird
    if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      pruneRateLimitMap()
    }
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= maxRequests) return false
  entry.count++
  return true
}

// ---------------------------------------------------------------------------
// BUG-5: CSRF-Schutz für zustandsändernde Methoden
// ---------------------------------------------------------------------------
// Prüft den Origin-Header für POST/PATCH/PUT/DELETE auf /api/owner/*.
// Requests ohne Origin-Header (z.B. Server-zu-Server) werden durchgelassen —
// requireOwner() in den API-Routen bleibt als zweite Schutzschicht aktiv.
// ---------------------------------------------------------------------------

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function isAllowedOrigin(origin: string): boolean {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'boost-hive.de'
  const localDomain = process.env.LOCAL_DOMAIN ?? 'localhost'

  if (origin === `http://${localDomain}:3000`) return true
  if (origin.startsWith('http://') && origin.endsWith(`.${localDomain}:3000`)) return true
  if (origin === `https://${rootDomain}`) return true
  if (origin === `https://www.${rootDomain}`) return true
  // Alle Subdomains erlauben (z.B. agentur.boost-hive.de)
  if (origin.startsWith('https://') && origin.endsWith(`.${rootDomain}`)) return true
  return false
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'boost-hive.de'
const LOCAL_DOMAIN = process.env.LOCAL_DOMAIN || 'localhost'
const IS_LOCAL = process.env.NODE_ENV === 'development'
const PREVIEW_ACCESS_COOKIE = 'bh_preview_access'

// Fallback tenant slug used when running on *.localhost in dev mode
const LOCAL_FALLBACK_TENANT_SLUG = 'test-tenant'

// Subdomain validation: 3-63 chars, lowercase alphanumeric + hyphens
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/
const STATIC_FILE_REGEX = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|woff2?|css|js|map)$/i

// ---------------------------------------------------------------------------
// Supabase client for proxy (lightweight, no cookies needed)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function redirectBlockedTenant(
  request: NextRequest,
  reason: 'tenant_inactive' | 'tenant_billing_blocked'
): Promise<NextResponse> {
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/')
  let response: NextResponse

  if (isApiRequest) {
    response = NextResponse.json(
      { error: 'Tenant ist archiviert oder aktuell gesperrt.', reason },
      { status: 403 }
    )
  } else {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('reason', reason)
    response = NextResponse.redirect(loginUrl)
  }

  const supabase = createMiddlewareClient(request, response)

  try {
    await supabase.auth.signOut()
  } catch (error) {
    console.warn('[Proxy] Blocked tenant sign-out failed:', error)
  }

  return response
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
// Route Protection — Paths that require authentication
// ---------------------------------------------------------------------------

// Tenant-scoped protected paths (require valid session + tenant membership)
const TENANT_PROTECTED_PREFIXES = ['/dashboard', '/settings', '/billing', '/onboarding']

// Admin-only paths within a tenant (require role === 'admin' in JWT)
const ADMIN_ONLY_PREFIXES = ['/settings/team', '/billing']

// Owner-scoped protected paths (require valid session + platform_admin)
const OWNER_PROTECTED_PREFIXES = ['/owner']

// Public paths that never require auth (even under protected prefixes)
const PUBLIC_PATHS = ['/login', '/owner/login', '/api/', '/_next/', '/favicon.ico']

const INACTIVE_TENANT_ALLOWED_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/api/auth/login',
  '/api/auth/password-reset/',
  '/api/invitations/',
  '/api/auth/email-link',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))
}

function isInactiveTenantAllowedPath(pathname: string): boolean {
  return INACTIVE_TENANT_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  )
}

function isTenantProtectedPath(pathname: string): boolean {
  return TENANT_PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function isOwnerProtectedPath(pathname: string): boolean {
  return OWNER_PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function hasPreviewAccess(request: NextRequest): boolean {
  return request.cookies.get(PREVIEW_ACCESS_COOKIE)?.value === 'granted'
}

function hasInternalVisibilityWorkerAccess(request: NextRequest): boolean {
  const pathname = request.nextUrl.pathname
  const isVisibilityWorkerRoute =
    pathname === '/api/tenant/visibility/worker' ||
    pathname === '/api/tenant/visibility/analytics/worker'

  if (!isVisibilityWorkerRoute) return false

  const workerSecret = process.env.VISIBILITY_WORKER_SECRET
  if (!workerSecret) return false

  return request.headers.get('x-worker-secret') === workerSecret
}

function isPreviewGateBypassPath(pathname: string): boolean {
  return (
    pathname === '/access' ||
    pathname === '/impressum' ||
    pathname === '/datenschutz' ||
    pathname === '/reset-password' ||
    (IS_LOCAL && pathname.startsWith('/api/test/')) ||
    pathname === '/api/auth/email-link' ||
    pathname === '/api/auth/password-reset/confirm' ||
    pathname.startsWith('/api/access') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    STATIC_FILE_REGEX.test(pathname)
  )
}

function buildPreviewRedirect(request: NextRequest): NextResponse {
  const accessUrl = request.nextUrl.clone()
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
  accessUrl.pathname = '/access'
  accessUrl.searchParams.set('returnTo', returnTo)
  return NextResponse.redirect(accessUrl)
}

// ---------------------------------------------------------------------------
// Proxy (Next.js 16 convention, replaces deprecated middleware.ts)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname
  const subdomain = extractSubdomain(host)

  if (
    !hasPreviewAccess(request) &&
    !hasInternalVisibilityWorkerAccess(request) &&
    !isPreviewGateBypassPath(pathname)
  ) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Temporärer Zugangsschutz aktiv. Bitte zuerst das Zugriffspasswort eingeben.' },
        { status: 401 }
      )
    }

    return buildPreviewRedirect(request)
  }

  // Owner-Routen und Owner-APIs sind strikt Root-Domain-only.
  if (
    subdomain !== null &&
    (pathname === '/owner/login' ||
      isOwnerProtectedPath(pathname) ||
      pathname === '/api/auth/owner/login' ||
      pathname.startsWith('/api/owner/'))
  ) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // CSRF-Schutz und Rate Limiting für /api/auth/* und /api/owner/* Routen
  const isAuthRoute = pathname.startsWith('/api/auth/')
  const isOwnerApiRoute = pathname.startsWith('/api/owner/')

  if (isAuthRoute || isOwnerApiRoute) {
    // CSRF: Origin-Prüfung für zustandsändernde Methoden
    if (STATE_CHANGING_METHODS.has(request.method)) {
      const origin = request.headers.get('origin')
      if (origin !== null && !isAllowedOrigin(origin)) {
        console.warn(`[CSRF] Blocked ${request.method} from origin: ${origin}`)
        return NextResponse.json(
          { error: 'Ungültige Anfragequelle (CSRF).' },
          { status: 403 }
        )
      }
    }

    // Rate Limiting: Auth-Routen strenger (5/min), Owner-API normal (30/min)
    const maxReqs = isAuthRoute ? AUTH_RATE_LIMIT_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS
    if (!checkRateLimit(request, maxReqs)) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen. Bitte warte eine Minute.' },
        { status: 429 }
      )
    }
  }

  // ----- Root domain (no subdomain) → handle owner routes + landing page -----
  if (subdomain === null) {
    if (isTenantProtectedPath(pathname)) {
      return new NextResponse('Not Found', { status: 404 })
    }

    // Strip any spoofed tenant headers before passing through (BUG-1 fix)
    const headers = sanitizedHeaders(request)
    const response = NextResponse.next({ request: { headers } })

    // Owner-protected routes: require authenticated owner session
    if (!isPublicPath(pathname) && isOwnerProtectedPath(pathname)) {
      const supabase = createMiddlewareClient(request, response)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/owner/login'
        loginUrl.searchParams.set('returnTo', pathname)
        return NextResponse.redirect(loginUrl)
      }
    }

    return response
  }

  // ----- Validate subdomain format -----
  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    return new NextResponse('Ungültige Subdomain', { status: 400 })
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
      const response = NextResponse.next({ request: { headers } })
      return maybeProtectTenantRoute(request, response, pathname, 'local-dev-fallback')
    }

    const tenantStatus = resolveTenantStatus(tenant)
    if (tenantStatus.blocksProtectedAppAccess && !isInactiveTenantAllowedPath(pathname)) {
      return redirectBlockedTenant(request, tenantStatus.loginBlockReason ?? 'tenant_inactive')
    }

    const headers = sanitizedHeaders(request)
    headers.set('x-tenant-id', tenant.id)
    headers.set('x-tenant-slug', tenant.slug)
    const response = NextResponse.next({ request: { headers } })
    return maybeProtectTenantRoute(request, response, pathname, tenant.id)
  }

  // ----- Production: resolve tenant from DB -----
  const tenant = await resolveTenant(subdomain)

  if (tenant === null) {
    const url = request.nextUrl.clone()
    url.pathname = '/not-found'
    return NextResponse.rewrite(url, { status: 404 })
  }

  const tenantStatus = resolveTenantStatus(tenant)
  if (tenantStatus.blocksProtectedAppAccess && !isInactiveTenantAllowedPath(pathname)) {
    return redirectBlockedTenant(request, tenantStatus.loginBlockReason ?? 'tenant_inactive')
  }

  // ----- Inject tenant context as request headers -----
  const headers = sanitizedHeaders(request)
  headers.set('x-tenant-id', tenant.id)
  headers.set('x-tenant-slug', tenant.slug)

  const response = NextResponse.next({ request: { headers } })
  return maybeProtectTenantRoute(request, response, pathname, tenant.id)
}

// ---------------------------------------------------------------------------
// Tenant Route Protection — checks session for protected paths
// ---------------------------------------------------------------------------

/**
 * If the current pathname is a tenant-protected route, verifies that the user
 * has a valid Supabase session AND is an active member of this tenant (BUG-3).
 * Redirects to /login with returnTo if not.
 * For public paths (login, API, static), passes through without checking.
 */
async function maybeProtectTenantRoute(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
  tenantId?: string
): Promise<NextResponse> {
  // Public paths don't need auth
  if (isPublicPath(pathname)) {
    return response
  }

  // Only check auth for protected tenant paths
  if (!isTenantProtectedPath(pathname)) {
    return response
  }

  const supabase = createMiddlewareClient(request, response)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // BUG-3: Cross-Tenant-Check — User muss aktives Mitglied dieses Tenants sein.
  // Verhindert, dass ein manuell übertragenes Cookie Zugriff auf fremde Tenants ermoegicht.
  if (tenantId && tenantId !== 'local-dev-fallback') {
    const adminClient = getSupabaseAdminClient()
    const { data: membership } = await adminClient
      .from('tenant_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single()

    if (!membership) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      return NextResponse.redirect(loginUrl)
    }
  }

  if (isAdminOnlyPath(pathname)) {
    const adminClient = getSupabaseAdminClient()
    const { data: adminMembership } = await adminClient
      .from('tenant_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('role', 'admin')
      .maybeSingle()

    if (!adminMembership) {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/dashboard'
      return NextResponse.redirect(dashboardUrl)
    }
  }

  return response
}

// ---------------------------------------------------------------------------
// Tenant Resolution (DB lookup with caching)
// ---------------------------------------------------------------------------

async function resolveTenant(
  slug: string
): Promise<{
  id: string
  slug: string
  status: string
  subscription_status: string | null
  billing_onboarding_completed_at: string | null
  archived_at: string | null
} | null> {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await loadTenantStatusRecord(supabase, { slug })
    if (error || !data) {
      return null
    }

    return {
      id: data.id as string,
      slug: data.slug as string,
      status: data.status as string,
      subscription_status: (data.subscription_status as string | null | undefined) ?? null,
      billing_onboarding_completed_at:
        (data.billing_onboarding_completed_at as string | null | undefined) ?? null,
      archived_at: (data.archived_at as string | null | undefined) ?? null,
    }
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
