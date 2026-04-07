import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()

  const [tenantResult, profileResult, membershipResult, analysesCountResult] = await Promise.all([
    admin
      .from('tenants')
      .select(
        'id, name, slug, billing_company, billing_street, billing_zip, billing_city, billing_country, billing_vat_id, created_at'
      )
      .eq('id', tenantId)
      .single(),
    admin
      .from('user_profiles')
      .select('first_name, last_name, avatar_url, notify_on_approval_decision')
      .eq('user_id', authResult.auth.userId)
      .maybeSingle(),
    admin
      .from('tenant_members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    admin
      .from('performance_analyses')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ])

  if (tenantResult.error || !tenantResult.data) {
    return NextResponse.json({ error: 'Tenantdaten konnten nicht exportiert werden.' }, { status: 500 })
  }

  const payload = {
    exported_at: new Date().toISOString(),
    exported_by_user_id: authResult.auth.userId,
    tenant: tenantResult.data,
    current_user_profile: profileResult.data ?? null,
    counts: {
      active_members: membershipResult.count ?? 0,
      performance_analyses: analysesCountResult.count ?? 0,
    },
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_export',
    resourceType: 'tenant_data_export',
    context: {
      exported_sections: ['tenant', 'current_user_profile', 'counts'],
      active_members: membershipResult.count ?? 0,
      performance_analyses: analysesCountResult.count ?? 0,
    },
  })

  const fileName = `tenant-data-export_${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
