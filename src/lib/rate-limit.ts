/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding-window approach keyed by an identifier (e.g. IP + route).
 *
 * Note: In Vercel serverless, each function instance has its own memory.
 * This limits abuse within a single instance — for cross-instance rate limiting
 * a shared store (e.g. Vercel KV / Redis) would be needed.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

interface RateLimitOptions {
  /** Max requests per window */
  limit: number
  /** Window duration in milliseconds */
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true, remaining: options.limit - 1, resetAt: now + options.windowMs }
  }

  if (entry.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: options.limit - entry.count, resetAt: entry.resetAt }
}

/**
 * Returns the client IP from a Next.js request (best-effort).
 * Falls back to 'unknown' if no IP is detectable.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
