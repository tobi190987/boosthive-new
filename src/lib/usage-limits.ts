import { createAdminClient } from '@/lib/supabase-admin'

export const PLAN_LIMITS = {
  ai_performance_analyses: 30,
  ai_visibility_analyses: 20,
} as const

export type QuotaMetric = keyof typeof PLAN_LIMITS

const METRIC_TABLE: Record<QuotaMetric, string> = {
  ai_performance_analyses: 'performance_analyses',
  ai_visibility_analyses: 'visibility_analyses',
}

export interface QuotaResult {
  allowed: boolean
  current: number
  limit: number
  reset_at: string
}

/**
 * Checks whether a tenant has remaining quota for a given metric in the current billing period.
 * periodStart is calculated as subscription_period_end - 1 month (mirrors Stripe's billing period).
 * If subscription_period_end is null (no active subscription), uses 1 month from now as fallback.
 */
export interface QuotaOverrideEntry {
  limit: number
  period_end: string
}

export async function checkQuota(
  tenantId: string,
  metric: QuotaMetric
): Promise<QuotaResult> {
  const table = METRIC_TABLE[metric]
  const admin = createAdminClient()

  // Load subscription_period_end + quota_overrides from tenant
  const { data: tenant } = await admin
    .from('tenants')
    .select('subscription_period_end, quota_overrides')
    .eq('id', tenantId)
    .maybeSingle()

  const periodEnd = tenant?.subscription_period_end
    ? new Date(tenant.subscription_period_end as string)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d })()

  const periodStart = new Date(periodEnd)
  periodStart.setMonth(periodStart.getMonth() - 1)

  // Check for owner override: valid only if stored period_end matches current period_end
  const overrides = (tenant?.quota_overrides ?? {}) as Record<string, QuotaOverrideEntry>
  const override = overrides[metric]
  const overrideValid =
    override &&
    typeof override.limit === 'number' &&
    override.period_end === periodEnd.toISOString()
  const limit = overrideValid ? override.limit : PLAN_LIMITS[metric]

  const { count } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', periodStart.toISOString())

  const current = count ?? 0

  return {
    allowed: current < limit,
    current,
    limit,
    reset_at: periodEnd.toISOString(),
  }
}
