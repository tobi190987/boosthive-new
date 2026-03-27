import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Creates a Supabase client for use inside the proxy/middleware layer.
 *
 * This client can read and write auth cookies on the request/response pair.
 * Cookies are NOT scoped to a parent domain — they stay on the current host,
 * preventing cross-tenant session sharing.
 */
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies on both the request (for downstream middleware/server)
          // and on the response (to send back to the browser).
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, {
              ...options,
              // Explicitly do NOT set 'domain' — this scopes the cookie
              // to the exact host (e.g. agentur-x.boost-hive.de) and
              // prevents cross-subdomain session leakage.
              domain: undefined,
            })
          })
        },
      },
    }
  )
}
