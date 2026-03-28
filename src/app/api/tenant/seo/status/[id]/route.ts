import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('seo_analyses')
    .select('id, status, pages_crawled, pages_total, result, error_msg, created_at, completed_at, config')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({
    id: data.id,
    status: data.status,
    pagesCrawled: data.pages_crawled,
    pagesTotal: data.pages_total,
    result: data.result,
    errorMsg: data.error_msg,
    createdAt: data.created_at,
    completedAt: data.completed_at,
    config: data.config,
  })
}
