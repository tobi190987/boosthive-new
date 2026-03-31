import { headers } from 'next/headers'

export interface TenantContext {
  id: string
  slug: string
}

/**
 * Reads tenant context from request headers in Server Components and Route Handlers.
 * Headers are injected by middleware after successful tenant resolution.
 * Returns null if no tenant context is present (e.g. root domain requests).
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const headerStore = await headers()
  const tenantId = headerStore.get('x-tenant-id')
  const tenantSlug = headerStore.get('x-tenant-slug')

  if (!tenantId || !tenantSlug) {
    return null
  }

  return { id: tenantId, slug: tenantSlug }
}

/**
 * Reads tenant context and throws if not present.
 * Use in pages/routes that require a valid tenant context.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const tenant = await getTenantContext()
  if (!tenant) {
    throw new Error('No tenant context found. This route requires a valid subdomain.')
  }
  return tenant
}
