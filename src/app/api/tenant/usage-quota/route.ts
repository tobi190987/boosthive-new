import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { checkQuota, PLAN_LIMITS, type QuotaMetric } from '@/lib/usage-limits'

/**
 * GET /api/tenant/usage-quota?metric=ai_performance_analyses
 * Returns current usage and limit for a given quota metric.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const metric = request.nextUrl.searchParams.get('metric') as QuotaMetric | null
  if (!metric || !(metric in PLAN_LIMITS)) {
    return NextResponse.json({ error: 'Ungültige oder fehlende metric.' }, { status: 400 })
  }

  const quota = await checkQuota(tenantId, metric)
  return NextResponse.json(quota)
}
