import { createBrowserClient as createBrowserSupabaseClient } from '@supabase/ssr'
import { createServerClient as createServerSupabaseClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase Client for Client Components (Browser)
 * Use this in 'use client' components only.
 */
export function createBrowserClient() {
  return createBrowserSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Supabase Client for Server Components and Route Handlers
 * Use this in Server Components, Server Actions, and API Routes.
 * Must be called within a request context (where cookies() is available).
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method is called from a Server Component where
            // cookies cannot be set. This can be safely ignored if middleware
            // is refreshing user sessions.
          }
        },
      },
    }
  )
}

/**
 * Lightweight Supabase client for Middleware (Edge Runtime).
 * Does NOT use cookies — used only for tenant lookups.
 */
export function createMiddlewareClient() {
  // Use the base supabase-js client directly for edge-compatible tenant lookups.
  // We import dynamically to avoid bundling issues in middleware.
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
