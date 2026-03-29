import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import {
  assertManualRefreshAllowed,
  createRankingRun,
  processRankingRun,
} from '@/lib/keyword-rankings'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'

const paramsSchema = z.object({
  id: z.string().uuid('Ungueltige Projekt-ID.'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`kw-rankings-refresh:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
  }

  const projectId = parsedParams.data.id
  const admin = createAdminClient()

  const { data: project, error: projectError } = await admin
    .from('keyword_projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 })

  const { data: connection, error: connectionError } = await admin
    .from('gsc_connections')
    .select('id, selected_property, status')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (connectionError) {
    return NextResponse.json({ error: connectionError.message }, { status: 500 })
  }
  if (!connection || connection.status !== 'connected' || !connection.selected_property) {
    return NextResponse.json(
      { error: 'Fuer dieses Projekt ist keine aktive GSC-Property konfiguriert.' },
      { status: 422 }
    )
  }

  try {
    await assertManualRefreshAllowed(projectId, tenantId)
    const run = await createRankingRun({
      tenantId,
      projectId,
      triggerType: 'manual',
    })
    const result = await processRankingRun(run.id)
    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tracking konnte nicht gestartet werden.'
    const status = message.includes('bereits ein Tracking-Job') || message.includes('wieder')
      ? 429
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
