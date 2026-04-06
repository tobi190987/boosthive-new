import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { createAdminClient } from '@/lib/supabase-admin'
import { getProjectTimeline } from '@/lib/visibility-report'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createServerTimer('tenant.visibility.timeline', {
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

  const finishProject = timer.mark('project')
  const { data: project } = await admin
    .from('visibility_projects')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  finishProject()

  if (!project) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: 'Projekt nicht gefunden.' }, { status: 404 }),
      timer.finish({ tenantId, projectId: id, failed: true, reason: 'not_found' })
    )
  }

  const finishTimeline = timer.mark('timeline')
  const timeline = await getProjectTimeline(tenantId, id)
  finishTimeline()
  return applyServerTimingHeaders(
    NextResponse.json(
      { timeline },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      }
    ),
    timer.finish({ tenantId, projectId: id, point_count: timeline.length })
  )
}
