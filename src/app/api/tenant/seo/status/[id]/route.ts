import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { getSeoAnalysisStatus } from '@/lib/tenant-app-data'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createServerTimer('tenant.seo.status', {
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
  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  finishAccess()
  if ('error' in moduleAccess) {
    return applyServerTimingHeaders(
      moduleAccess.error,
      timer.finish({ tenantId, failed: true, reason: 'module_access' })
    )
  }

  const { id } = await params
  try {
    const finishLoad = timer.mark('load')
    const data = await getSeoAnalysisStatus(tenantId, id)
    finishLoad()
    if (!data) {
      return applyServerTimingHeaders(
        NextResponse.json({ error: 'Analyse nicht gefunden.' }, { status: 404 }),
        timer.finish({ tenantId, analysisId: id, failed: true, reason: 'not_found' })
      )
    }

    return applyServerTimingHeaders(
      NextResponse.json(data),
      timer.finish({ tenantId, analysisId: id, status: data.status })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analyse konnte nicht geladen werden.'
    return applyServerTimingHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
      timer.finish({ tenantId, analysisId: id, failed: true })
    )
  }
}
