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
    .select('id, status, progress_done, progress_total, error_log, models, iterations')
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
    status: analysis.status,
    progress_done: analysis.progress_done,
    progress_total: analysis.progress_total,
    error_log: analysis.error_log ?? [],
    model_progress: modelProgress,
  })
}
