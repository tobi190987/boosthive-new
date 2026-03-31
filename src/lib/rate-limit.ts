/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding-window approach keyed by an identifier (e.g. IP + route).
 *
 * Note: In Vercel serverless, each function instance has its own memory.
 * This limits abuse within a single instance — for cross-instance rate limiting
 * a shared store (e.g. Vercel KV / Redis) would be needed.
 */

import { NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export function resetRateLimitStore() {
  store.clear()
}

export interface RateLimitOptions {
  /** Max requests per window */
  limit: number
  /** Window duration in milliseconds */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  /** The limit that was applied (for response headers) */
  limit: number
}

// ---------------------------------------------------------------------------
// Presets for auth routes
// ---------------------------------------------------------------------------

/** Tenant login: 10 requests / 15 min / IP */
export const AUTH_LOGIN: RateLimitOptions = { limit: 10, windowMs: 15 * 60 * 1000 }

/** Owner login: 5 requests / 15 min / IP (stricter) */
export const AUTH_OWNER_LOGIN: RateLimitOptions = { limit: 5, windowMs: 15 * 60 * 1000 }

/** Password reset request: 3 requests / 15 min / IP (strictest) */
export const AUTH_RESET: RateLimitOptions = { limit: 3, windowMs: 15 * 60 * 1000 }

/** Invitation accept: 10 requests / 15 min / IP */
export const AUTH_INVITE: RateLimitOptions = { limit: 10, windowMs: 15 * 60 * 1000 }

/** Owner billing overview/detail reads: 60 requests / min / IP */
export const OWNER_READ: RateLimitOptions = { limit: 60, windowMs: 60 * 1000 }

/** Owner billing mutations: 20 requests / min / IP */
export const OWNER_WRITE: RateLimitOptions = { limit: 20, windowMs: 60 * 1000 }

/** Visibility project/analysis reads: 60 requests / min / tenant+IP */
export const VISIBILITY_READ: RateLimitOptions = { limit: 60, windowMs: 60 * 1000 }

/** Visibility project mutations: 20 requests / min / tenant+IP */
export const VISIBILITY_PROJECT_WRITE: RateLimitOptions = { limit: 20, windowMs: 60 * 1000 }

/** Customer list reads: 60 requests / min / tenant+IP */
export const CUSTOMERS_READ: RateLimitOptions = { limit: 60, windowMs: 60 * 1000 }

/** Customer mutations (create/update/delete): 30 requests / min / tenant+IP */
export const CUSTOMERS_WRITE: RateLimitOptions = { limit: 30, windowMs: 60 * 1000 }

/** Visibility analysis starts: 10 requests / 15 min / tenant+IP */
export const VISIBILITY_ANALYSIS_START: RateLimitOptions = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
}

/** Visibility estimate calls: 30 requests / 15 min / tenant+IP */
export const VISIBILITY_ESTIMATE: RateLimitOptions = { limit: 30, windowMs: 15 * 60 * 1000 }

/** SEO competitor compare (expensive — 2–4 outbound fetches): 5 requests / 15 min / tenant+IP */
export const SEO_COMPARE_START: RateLimitOptions = { limit: 5, windowMs: 15 * 60 * 1000 }

/** GSC OAuth connect (starts OAuth flow): 5 requests / 15 min / tenant+IP */
export const GSC_CONNECT: RateLimitOptions = { limit: 5, windowMs: 15 * 60 * 1000 }

/** GSC read endpoints (status, properties): 60 requests / min / tenant+IP */
export const GSC_READ: RateLimitOptions = { limit: 60, windowMs: 60 * 1000 }

/** GSC mutations (set property, disconnect): 20 requests / min / tenant+IP */
export const GSC_WRITE: RateLimitOptions = { limit: 20, windowMs: 60 * 1000 }

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true, remaining: options.limit - 1, resetAt: now + options.windowMs, limit: options.limit }
  }

  if (entry.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit: options.limit }
  }

  entry.count++
  return { allowed: true, remaining: options.limit - entry.count, resetAt: entry.resetAt, limit: options.limit }
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

/**
 * Creates a 429 Too Many Requests response with standard rate limit headers.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))

  return NextResponse.json(
    { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}

/**
 * Returns the client IP from a Next.js request (best-effort).
 * Falls back to 'unknown' if no IP is detectable.
 */
export function getClientIp(request: Request): string {
  // x-real-ip is set by Vercel's edge network and cannot be spoofed by clients.
  // x-forwarded-for as fallback (first IP in chain = original client).
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}
