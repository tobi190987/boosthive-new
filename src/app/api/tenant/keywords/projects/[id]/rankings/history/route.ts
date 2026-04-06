import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { getRankingHistory } from '@/lib/keyword-rankings'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { checkRateLimit, getClientIp, rateLimitResponse, VISIBILITY_READ } from '@/lib/rate-limit'

const paramsSchema = z.object({
  id: z.string().uuid('Ungültige Projekt-ID.'),
})

const querySchema = z.object({
  keyword_id: z.string().uuid('Ungültige Keyword-ID.'),
  days: z.coerce.number().int().refine((value) => value === 30 || value === 90, 'days muss 30 oder 90 sein.'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createServerTimer('tenant.keyword.rankings_history', {
    path: request.nextUrl.pathname,
  })
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 }),
      timer.finish({ failed: true, reason: 'missing_tenant_context' })
    )
  }

  const rl = checkRateLimit(`kw-rankings-history:${tenantId}:${getClientIp(request)}`, VISIBILITY_READ)
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

  const parsedQuery = querySchema.safeParse({
    keyword_id: request.nextUrl.searchParams.get('keyword_id'),
    days: request.nextUrl.searchParams.get('days'),
  })
  if (!parsedQuery.success) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: parsedQuery.error.issues[0]?.message }, { status: 400 }),
      timer.finish({
        tenantId,
        projectId: parsedParams.data.id,
        failed: true,
        reason: 'invalid_query',
      })
    )
  }

  try {
    const finishLoad = timer.mark('history')
    const data = await getRankingHistory(
      tenantId,
      parsedParams.data.id,
      parsedQuery.data.keyword_id,
      parsedQuery.data.days
    )
    finishLoad()
    return applyServerTimingHeaders(
      NextResponse.json(data, {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      }),
      timer.finish({
        tenantId,
        projectId: parsedParams.data.id,
        keywordId: parsedQuery.data.keyword_id,
        days: parsedQuery.data.days,
        series_count: data.series.length,
      })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ranking-Verlauf konnte nicht geladen werden.'
    const status = message === 'Keyword nicht gefunden.' ? 404 : 500
    return applyServerTimingHeaders(
      NextResponse.json({ error: message }, { status }),
      timer.finish({
        tenantId,
        projectId: parsedParams.data.id,
        keywordId: parsedQuery.data.keyword_id,
        days: parsedQuery.data.days,
        failed: true,
        reason: status === 404 ? 'not_found' : 'load_error',
      })
    )
  }
}
