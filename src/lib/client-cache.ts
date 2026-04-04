'use client'

const memoryCache = new Map<string, unknown>()

export function readSessionCache<T>(key: string): T | null {
  const cached = memoryCache.get(key)
  if (cached !== undefined) {
    return cached as T
  }

  if (typeof window === 'undefined') return null

  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as T
    memoryCache.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

export function writeSessionCache<T>(key: string, value: T) {
  memoryCache.set(key, value)

  if (typeof window === 'undefined') return

  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage quota and serialization issues.
  }
}

export function clearSessionCache(key: string) {
  memoryCache.delete(key)

  if (typeof window === 'undefined') return

  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore storage removal issues.
  }
}
