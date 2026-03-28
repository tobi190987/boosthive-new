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

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const analysisId = new URL(request.url).searchParams.get('analysis_id')
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('visibility_projects')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })
  }

  let resolvedAnalysisId = analysisId

  if (!resolvedAnalysisId) {
    const { data: latestAnalysis } = await admin
      .from('visibility_analyses')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('project_id', id)
      .in('analytics_status', ['done', 'partial'])
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    resolvedAnalysisId = latestAnalysis?.id ?? null
  }

  if (!resolvedAnalysisId) {
    return NextResponse.json({ analysis_id: null, recommendations: [] })
  }

  const { data: recommendations, error } = await admin
    .from('visibility_recommendations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('project_id', id)
    .eq('analysis_id', resolvedAnalysisId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    analysis_id: resolvedAnalysisId,
    recommendations: recommendations ?? [],
  })
}
