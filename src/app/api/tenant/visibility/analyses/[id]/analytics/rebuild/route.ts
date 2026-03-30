import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { dispatchAnalyticsWorker } from '@/lib/visibility-analytics'

export async function POST(
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
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !analysis) {
    return NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 })
  }

  if (analysis.status !== 'done') {
    return NextResponse.json(
      { error: 'Analytics können erst nach abgeschlossener Analyse neu berechnet werden.' },
      { status: 400 }
    )
  }

  await admin
    .from('visibility_analyses')
    .update({
      analytics_status: 'pending',
      analytics_error_message: null,
      analytics_started_at: null,
      analytics_completed_at: null,
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)

  await dispatchAnalyticsWorker(id, { force: true })

  return NextResponse.json({ queued: true })
}
