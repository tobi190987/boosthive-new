import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'

/**
 * Stub API route for Google Ads dashboard data.
 * Returns `connected: false` until PROJ-51 implements the real Google Ads integration.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  // Stub: no Google Ads integration yet
  return NextResponse.json({
    connected: false,
    data: null,
    trend: null,
  })
}
