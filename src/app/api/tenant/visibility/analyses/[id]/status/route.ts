import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_READ } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`visibility-analysis-status:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const admin = createAdminClient()

  const { data: analysis, error } = await admin
    .from('visibility_analyses')
    .select('id, project_id, status, error_message, progress_done, progress_total, error_log, models, iterations, analytics_status, analytics_error_message')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !analysis) {
    return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })
  }

  // Compute per-model progress from raw results
  const { data: rawCounts } = await admin
    .from('visibility_raw_results')
    .select('model_name')
    .eq('tenant_id', tenantId)
    .eq('analysis_id', id)

  const doneCounts: Record<string, number> = {}
  for (const row of rawCounts ?? []) {
    doneCounts[row.model_name] = (doneCounts[row.model_name] ?? 0) + 1
  }

  const modelsPerAnalysis: string[] = analysis.models ?? []
  const totalPerModel = analysis.progress_total > 0
    ? Math.round(analysis.progress_total / Math.max(modelsPerAnalysis.length, 1))
    : 0

  const modelProgress = modelsPerAnalysis.map((modelId: string) => ({
    model: modelId,
    done: doneCounts[modelId] ?? 0,
    total: totalPerModel,
  }))

  return NextResponse.json({
    project_id: analysis.project_id,
    models: analysis.models ?? [],
    iterations: analysis.iterations ?? 5,
    status: analysis.status,
    error_message: analysis.error_message,
    analytics_status: analysis.analytics_status,
    analytics_error_message: analysis.analytics_error_message,
    progress_done: analysis.progress_done,
    progress_total: analysis.progress_total,
    error_log: analysis.error_log ?? [],
    model_progress: modelProgress,
  })
}
