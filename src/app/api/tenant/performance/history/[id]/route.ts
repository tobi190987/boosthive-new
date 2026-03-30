import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_performance')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('performance_analyses')
    .select('id, type, client_label, platform, analysis, meta, created_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })

  return NextResponse.json(data)
}
