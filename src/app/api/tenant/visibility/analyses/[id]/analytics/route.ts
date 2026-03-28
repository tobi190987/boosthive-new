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
  const admin = createAdminClient()

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

  if (error || !analysis) {
    return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })
  }

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

  return NextResponse.json({
    analysis,
    scores: scores ?? [],
    sources: sources ?? [],
    recommendations: recommendations ?? [],
  })
}
