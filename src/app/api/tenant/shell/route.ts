import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { getTenantShellSummary } from '@/lib/tenant-app-data'

export async function GET(request: NextRequest) {
  const timer = createServerTimer('tenant.shell', {
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

  try {
    const finishSummary = timer.mark('summary')
    const summary = await getTenantShellSummary(tenantId, authResult.auth.userId)
    finishSummary()
    return applyServerTimingHeaders(NextResponse.json(summary), timer.finish({ tenantId }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shell-Daten konnten nicht geladen werden.'
    return applyServerTimingHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
      timer.finish({ tenantId, failed: true })
    )
  }
}
