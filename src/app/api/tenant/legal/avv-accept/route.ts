import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

/**
 * POST /api/tenant/legal/avv-accept
 * Tenant-Admin bestätigt, den AV-Vertrag unterzeichnet zu haben.
 * Setzt avv_accepted_at + avv_accepted_by auf dem Tenant.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()
  const { error } = await admin
    .from('tenants')
    .update({
      avv_accepted_at: new Date().toISOString(),
      avv_accepted_by: authResult.auth.userId,
    })
    .eq('id', tenantId)

  if (error) {
    return NextResponse.json({ error: 'AVV-Status konnte nicht gespeichert werden.' }, { status: 500 })
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_export',
    resourceType: 'avv_acceptance',
    context: { confirmed: true },
  })

  return NextResponse.json({ ok: true })
}
