import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('seo_analyses')
    .select('id, status, pages_crawled, pages_total, result, created_at, completed_at, config')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const summaries = (data ?? []).map((analysis) => ({
    id: analysis.id,
    status: analysis.status,
    pagesCrawled: analysis.pages_crawled,
    pagesTotal: analysis.pages_total,
    overallScore: (analysis.result as { overallScore?: number } | null)?.overallScore ?? null,
    totalPages: (analysis.result as { totalPages?: number } | null)?.totalPages ?? null,
    createdAt: analysis.created_at,
    completedAt: analysis.completed_at,
    config: analysis.config,
  }))

  return NextResponse.json(summaries)
}
