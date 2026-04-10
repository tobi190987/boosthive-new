import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkQuota, PLAN_LIMITS, type QuotaMetric, type QuotaOverrideEntry } from '@/lib/usage-limits'
import { checkRateLimit, getClientIp, rateLimitResponse, OWNER_READ, OWNER_WRITE } from '@/lib/rate-limit'

const patchSchema = z.object({
  metric: z.enum(['ai_performance_analyses', 'ai_visibility_analyses']),
  /**
   * Neues Limit als positive Ganzzahl.
   * Sende `null` um einen bestehenden Override zu entfernen und auf den Standardwert zurückzusetzen.
   */
  limit: z.number().int().min(1).max(9999).nullable(),
})

/**
 * GET /api/owner/tenants/[id]/quota
 * Returns current usage + limit for all metrics of a tenant.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const rl = checkRateLimit(`owner-quota-read:${getClientIp(request)}`, OWNER_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const { id: tenantId } = await params
  const admin = createAdminClient()

  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })

  const [performance, visibility] = await Promise.all([
    checkQuota(tenantId, 'ai_performance_analyses'),
    checkQuota(tenantId, 'ai_visibility_analyses'),
  ])

  return NextResponse.json({
    ai_performance_analyses: { ...performance, default_limit: PLAN_LIMITS.ai_performance_analyses },
    ai_visibility_analyses: { ...visibility, default_limit: PLAN_LIMITS.ai_visibility_analyses },
  })
}

/**
 * PATCH /api/owner/tenants/[id]/quota
 * Sets or removes an override limit for a metric for the current billing period.
 * Body: { metric: QuotaMetric, limit: number | null }
 * Pass limit: null to remove the override and revert to the default plan limit.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const rl = checkRateLimit(`owner-quota-write:${getClientIp(request)}`, OWNER_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const { id: tenantId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { metric, limit: newLimit } = parsed.data
  const admin = createAdminClient()

  // Load current tenant to get subscription_period_end and existing overrides
  const { data: tenant } = await admin
    .from('tenants')
    .select('subscription_period_end, quota_overrides')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })

  const periodEnd = tenant.subscription_period_end
    ? new Date(tenant.subscription_period_end as string)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d })()

  const existing = (tenant.quota_overrides ?? {}) as Record<string, QuotaOverrideEntry>

  let updated: Record<string, QuotaOverrideEntry>
  if (newLimit === null) {
    // Entferne den Override für dieses Metric
    const { [metric as QuotaMetric]: _removed, ...rest } = existing
    updated = rest
  } else {
    // Setze oder überschreibe den Override
    updated = {
      ...existing,
      [metric as QuotaMetric]: {
        limit: newLimit,
        period_end: periodEnd.toISOString(),
      },
    }
  }

  const { error } = await admin
    .from('tenants')
    .update({ quota_overrides: updated })
    .eq('id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, metric, limit: newLimit, period_end: periodEnd.toISOString() })
}
