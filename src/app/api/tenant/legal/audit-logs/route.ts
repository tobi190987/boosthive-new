import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { listTenantDataAuditLogs } from '@/lib/tenant-data-audit'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const items = await listTenantDataAuditLogs(tenantId, 100)
  return NextResponse.json({ items })
}
