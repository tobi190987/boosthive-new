import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin, requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_performance')
  if ('error' in moduleAccess) return moduleAccess.error

  const customerId = request.nextUrl.searchParams.get('customer_id')

  const admin = createAdminClient()
  let query = admin
    .from('performance_analyses')
    .select('id, type, client_label, platform, meta, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ analyses: data ?? [] })
}

export async function DELETE(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_performance')
  if ('error' in moduleAccess) return moduleAccess.error

  const admin = createAdminClient()
  const { error, count } = await admin
    .from('performance_analyses')
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'performance_analyses',
    context: { deleted_count: count ?? 0 },
  })

  return NextResponse.json({ success: true, deleted_count: count ?? 0 })
}
