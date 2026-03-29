import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  VISIBILITY_ANALYSIS_START,
  VISIBILITY_READ,
} from '@/lib/rate-limit'

const MAX_CONCURRENT_ANALYSES = 2

const createAnalysisSchema = z.object({
  project_id: z.string().trim().uuid('Ungueltige project_id.'),
  models: z
    .array(z.string().trim().min(1))
    .transform((models) => models.filter(Boolean))
    .refine((models) => models.length > 0, 'Mindestens 1 Modell erforderlich.'),
  iterations: z.coerce
    .number()
    .int()
    .min(5, 'Mindestens 5 Iterationen.')
    .max(10, 'Maximal 10 Iterationen.'),
})

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`visibility-analyses-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id fehlt.' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('visibility_analyses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ analyses: data ?? [] })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(
    `visibility-analyses-start:${tenantId}:${getClientIp(request)}`,
    VISIBILITY_ANALYSIS_START
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_visibility')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createAnalysisSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json(
      { error: firstDetail ?? 'Validierungsfehler.', details },
      { status: 400 }
    )
  }

  const { project_id, models, iterations } = parsed.data
  const admin = createAdminClient()

  // Verify project belongs to tenant
  const { data: project } = await admin
    .from('visibility_projects')
    .select('id, keywords, competitors, brand_name')
    .eq('tenant_id', tenantId)
    .eq('id', project_id)
    .maybeSingle()

  if (!project) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  // Check concurrent analysis limit
  const { count } = await admin
    .from('visibility_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'queued', 'running'])

  const status = (count ?? 0) >= MAX_CONCURRENT_ANALYSES ? 'queued' : 'pending'

  const subjects = 1 + ((project.competitors as Array<{ name: string }>)?.length ?? 0)
  const progressTotal = project.keywords.length * models.length * iterations * subjects

  // Estimated cost: ~$0.001 per query
  const estimatedCost = progressTotal * 0.001

  const { data: analysis, error } = await admin
    .from('visibility_analyses')
    .insert({
      tenant_id: tenantId,
      project_id,
      created_by: authResult.auth.userId,
      models,
      iterations,
      status,
      progress_done: 0,
      progress_total: progressTotal,
      estimated_cost: estimatedCost,
      error_log: [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget: trigger background worker
  // Only trigger if status is 'pending' (not queued)
  if (status === 'pending') {
    void dispatchWorker(analysis.id)
  }

  return NextResponse.json({ analysis }, { status: 201 })
}

async function dispatchWorker(analysisId: string): Promise<void> {
  const admin = createAdminClient()
  const workerSecret = process.env.VISIBILITY_WORKER_SECRET
  if (!workerSecret) {
    await markAnalysisFailed(admin, analysisId, 'VISIBILITY_WORKER_SECRET ist nicht konfiguriert.')
    return
  }

  const workerUrl = `${getWorkerBaseUrl()}/api/tenant/visibility/worker`
  fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-secret': workerSecret,
    },
    body: JSON.stringify({ analysis_id: analysisId }),
  })
    .then(async (response) => {
      if (response.ok) return

      const body = await response.json().catch(() => ({}))
      const message =
        typeof body.error === 'string'
          ? body.error
          : `Worker-Start fehlgeschlagen (${response.status}).`

      await markAnalysisFailed(admin, analysisId, message)
    })
    .catch(async (err) => {
      const message =
        err instanceof Error ? err.message : 'Worker konnte nicht gestartet werden.'

      await markAnalysisFailed(admin, analysisId, message)
    })
}

async function markAnalysisFailed(
  admin: ReturnType<typeof createAdminClient>,
  analysisId: string,
  errorMessage: string
): Promise<void> {
  await admin
    .from('visibility_analyses')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
    .in('status', ['pending', 'running'])
}

function getWorkerBaseUrl(): string {
  // In production, use the app URL; locally, use localhost
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
