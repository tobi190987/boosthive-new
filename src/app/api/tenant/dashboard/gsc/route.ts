import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'

/**
 * Stub API route for Google Search Console dashboard data.
 * Returns `connected: false` until the real GSC dashboard endpoint is wired.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  // Stub: GSC dashboard endpoint not yet wired
  return NextResponse.json({
    connected: false,
    data: null,
    trend: null,
  })
}
