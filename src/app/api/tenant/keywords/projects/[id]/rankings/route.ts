import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { getRankingsDashboard } from '@/lib/keyword-rankings'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_READ } from '@/lib/rate-limit'

const paramsSchema = z.object({
  id: z.string().uuid('Ungültige Projekt-ID.'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createServerTimer('tenant.keyword.rankings', {
    path: request.nextUrl.pathname,
  })
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 }),
      timer.finish({ failed: true, reason: 'missing_tenant_context' })
    )
  }

  const rl = checkRateLimit(`kw-rankings-read:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
  if (!rl.allowed) {
    return applyServerTimingHeaders(
      rateLimitResponse(rl),
      timer.finish({ tenantId, failed: true, reason: 'rate_limited' })
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

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 }),
      timer.finish({ tenantId, failed: true, reason: 'invalid_params' })
    )
  }

  try {
    const finishLoad = timer.mark('dashboard')
    const data = await getRankingsDashboard(tenantId, parsedParams.data.id)
    finishLoad()
    return applyServerTimingHeaders(
      NextResponse.json(data, {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        },
      }),
      timer.finish({
        tenantId,
        projectId: parsedParams.data.id,
        row_count: data.rows.length,
      })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ranking-Dashboard konnte nicht geladen werden.'
    const status = message === 'Projekt nicht gefunden.' ? 404 : 500
    return applyServerTimingHeaders(
      NextResponse.json({ error: message }, { status }),
      timer.finish({
        tenantId,
        projectId: parsedParams.data.id,
        failed: true,
        reason: status === 404 ? 'not_found' : 'load_error',
      })
    )
  }
}
