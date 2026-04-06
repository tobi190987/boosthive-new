import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createServerTimer('tenant.visibility.analytics', {
    path: request.nextUrl.pathname,
  })
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 }),
      timer.finish({ failed: true, reason: 'missing_tenant_context' })
    )
  }

  const finishAuth = timer.mark('auth')
  const authResult = await requireTenantUser(tenantId)
  finishAuth()
  if ('error' in authResult) {
    return applyServerTimingHeaders(
      authResult.error,
      timer.finish({ tenantId, failed: true, reason: 'auth' })
    )
  }

  const finishAccess = timer.mark('module_access')
  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  finishAccess()
  if ('error' in moduleAccess) {
    return applyServerTimingHeaders(
      moduleAccess.error,
      timer.finish({ tenantId, failed: true, reason: 'module_access' })
    )
  }

  const { id } = await params
  const admin = createAdminClient()

  const finishAnalysis = timer.mark('analysis')
  const { data: analysis, error } = await admin
    .from('visibility_analyses')
    .select(`
      id,
      tenant_id,
      project_id,
      status,
      analytics_status,
      analytics_error_message,
      analytics_started_at,
      analytics_completed_at,
      created_at,
      completed_at,
      visibility_projects!inner(id, brand_name, website_url, competitors, keywords)
    `)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  finishAnalysis()

  if (error || !analysis) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 }),
      timer.finish({ tenantId, analysisId: id, failed: true, reason: 'not_found' })
    )
  }

  const finishRelated = timer.mark('related')
  const [{ data: scores }, { data: sources }, { data: recommendations }] = await Promise.all([
    admin
      .from('visibility_scores')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('analysis_id', id)
      .order('keyword', { ascending: true }),
    admin
      .from('visibility_sources')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('analysis_id', id)
      .order('mention_count', { ascending: false })
      .limit(200),
    admin
      .from('visibility_recommendations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('analysis_id', id)
      .order('sort_order', { ascending: true }),
  ])
  finishRelated()

  return applyServerTimingHeaders(
    NextResponse.json(
      {
        analysis,
        scores: scores ?? [],
        sources: sources ?? [],
        recommendations: recommendations ?? [],
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        },
      }
    ),
    timer.finish({
      tenantId,
      analysisId: id,
      score_count: (scores ?? []).length,
      source_count: (sources ?? []).length,
      recommendation_count: (recommendations ?? []).length,
    })
  )
}
