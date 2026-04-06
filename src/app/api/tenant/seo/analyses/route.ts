import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { getSeoAnalysisSummaries } from '@/lib/tenant-app-data'

export async function GET(request: NextRequest) {
  const timer = createServerTimer('tenant.seo.analyses', {
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

  const customerId = request.nextUrl.searchParams.get('customer_id')
  try {
    const finishLoad = timer.mark('load')
    const summaries = await getSeoAnalysisSummaries(tenantId, customerId)
    finishLoad()
    return applyServerTimingHeaders(
      NextResponse.json(summaries),
      timer.finish({
        tenantId,
        customer_filtered: Boolean(customerId),
        count: summaries.length,
      })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysen konnten nicht geladen werden.'
    return applyServerTimingHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
      timer.finish({ tenantId, failed: true, customer_filtered: Boolean(customerId) })
    )
  }
}
