import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  BUDGETS_SYNC,
} from '@/lib/rate-limit'
import {
  getGoogleAdsIntegration,
  parseGoogleAdsCredentials,
  getGoogleAdsDashboardSnapshot,
} from '@/lib/google-ads-api'
import {
  getMetaAdsIntegration,
  parseMetaAdsCredentials,
  getMetaAdsDashboardSnapshot,
} from '@/lib/meta-ads-api'
import {
  getTikTokAdsIntegration,
  parseTikTokAdsCredentials,
  getTikTokAdsDashboardSnapshot,
} from '@/lib/tiktok-ads-api'

const syncSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month muss YYYY-MM sein.').optional(),
})

// ── POST /api/tenant/budgets/sync ──
// Fetches spend data from connected Ads APIs and upserts into ad_spend_entries.
// Also caches CPC, CPM, ROAS on the budget record.
// Fires notifications when alert thresholds are crossed.

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-sync:${tenantId}:${getClientIp(request)}`, BUDGETS_SYNC)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error
  const userId = authResult.auth.userId

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const now = new Date()
  const monthParam = parsed.data.month
  const targetMonth = monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const budgetMonthDate = `${targetMonth}-01`
  const [year, month] = budgetMonthDate.split('-').map(Number)
  const monthStart = budgetMonthDate
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

  const admin = createAdminClient()

  // Load all budgets for the target month
  const { data: budgets, error: budgetsError } = await admin
    .from('ad_budgets')
    .select('id, customer_id, platform, planned_amount, alert_threshold_percent, alert_80_sent_at, alert_100_sent_at, alert_150_sent_at, customers!inner(name)')
    .eq('tenant_id', tenantId)
    .eq('budget_month', budgetMonthDate)
    .limit(200)

  if (budgetsError) return NextResponse.json({ error: budgetsError.message }, { status: 500 })
  if (!budgets || budgets.length === 0) {
    return NextResponse.json({ synced: 0, message: 'Keine Budgets für diesen Monat vorhanden.' })
  }

  let syncedCount = 0
  const errors: string[] = []

  for (const budget of budgets) {
    try {
      const customerId = budget.customer_id
      const platform = budget.platform as 'google_ads' | 'meta_ads' | 'tiktok_ads'

      let dailySpend: { date: string; amount: number }[] = []
      let cpc: number | null = null
      let cpm: number | null = null
      let roas: number | null = null

      if (platform === 'google_ads') {
        const integration = await getGoogleAdsIntegration(tenantId, customerId)
        if (!integration || integration.status === 'disconnected') continue
        const credentials = parseGoogleAdsCredentials(integration.credentials_encrypted)
        if (!credentials || !credentials.google_ads_customer_id) continue

        const snapshot = await getGoogleAdsDashboardSnapshot(integration, credentials, '30d')
        const timeseries = snapshot.data.timeseries ?? []

        // Filter to target month and map to { date, amount }
        dailySpend = timeseries
          .filter((p) => {
            const dateStr = p.label // YYYY-MM-DD
            return dateStr >= monthStart && dateStr <= monthEnd
          })
          .map((p) => ({ date: p.label, amount: p.value }))

        const totalCost = snapshot.data.totalCost
        const clicks = snapshot.data.campaigns.reduce((a, c) => a + (c.clicks ?? 0), 0)
        const impressions = 0 // Not directly available in GoogleAdsDashboardData
        cpc = totalCost > 0 && clicks > 0 ? totalCost / clicks : null
        cpm = impressions > 0 ? (totalCost / impressions) * 1000 : null
        roas = null // Not directly available without conversion value

      } else if (platform === 'meta_ads') {
        const integration = await getMetaAdsIntegration(tenantId, customerId)
        if (!integration || integration.status === 'disconnected') continue
        const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
        if (!credentials?.selected_ad_account_id) continue

        const snapshot = await getMetaAdsDashboardSnapshot(integration, credentials, '30d')
        const timeseries = snapshot.data.timeseries ?? []

        dailySpend = timeseries
          .filter((p) => {
            const dateStr = p.label
            return dateStr >= monthStart && dateStr <= monthEnd
          })
          .map((p) => ({ date: p.label, amount: p.value }))

        const totalCost = snapshot.data.totalCost
        const totalImpressions = snapshot.data.totalImpressions ?? 0
        cpm = totalCost > 0 && totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : null
        cpc = null
        roas = null

      } else if (platform === 'tiktok_ads') {
        const integration = await getTikTokAdsIntegration(tenantId, customerId)
        if (!integration || integration.status === 'disconnected') continue
        const credentials = parseTikTokAdsCredentials(integration.credentials_encrypted)
        if (!credentials?.selected_advertiser_id) continue

        const snapshot = await getTikTokAdsDashboardSnapshot(integration, credentials, '30d')
        const timeseries = snapshot.data.timeseries ?? []

        dailySpend = timeseries
          .filter((p) => {
            const dateStr = p.label
            return dateStr >= monthStart && dateStr <= monthEnd
          })
          .map((p) => ({ date: p.label, amount: p.value }))

        cpc = null
        cpm = null
        roas = null
      }

      if (dailySpend.length === 0) continue

      // Upsert daily spend entries
      const spendEntries = dailySpend.map((d) => ({
        budget_id: budget.id,
        tenant_id: tenantId,
        spend_date: d.date,
        amount: d.amount,
        source: `api_${platform.replace('_ads', '')}` as 'api_google' | 'api_meta' | 'api_tiktok',
      }))

      const { error: upsertError } = await admin
        .from('ad_spend_entries')
        .upsert(spendEntries, { onConflict: 'budget_id,spend_date' })

      if (upsertError) {
        errors.push(`Budget ${budget.id}: ${upsertError.message}`)
        continue
      }

      // Update cached metrics on budget record
      await admin
        .from('ad_budgets')
        .update({
          cached_cpc: cpc,
          cached_cpm: cpm,
          cached_roas: roas,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', budget.id)

      syncedCount++

      // Check alert thresholds
      const totalSpent = dailySpend.reduce((a, d) => a + d.amount, 0)
      const plannedAmount = Number(budget.planned_amount)
      if (plannedAmount <= 0) continue

      const spentPercent = (totalSpent / plannedAmount) * 100
      const customerName = (Array.isArray(budget.customers) ? (budget.customers as { name: string }[])[0]?.name : (budget.customers as { name: string } | null)?.name) ?? 'Unbekannt'
      const platformLabel =
        platform === 'google_ads' ? 'Google Ads' : platform === 'meta_ads' ? 'Meta Ads' : 'TikTok Ads'

      // 150% alert
      if (spentPercent >= 150 && !budget.alert_150_sent_at) {
        await admin.from('notifications').insert({
          tenant_id: tenantId,
          user_id: userId,
          type: 'budget_alert',
          title: 'Kritisches Budget-Überschreitung',
          body: `${customerName}: ${platformLabel} Budget zu ${Math.round(spentPercent)}% verbraucht (über 150%).`,
        })
        await admin
          .from('ad_budgets')
          .update({ alert_150_sent_at: new Date().toISOString() })
          .eq('id', budget.id)
      }

      // 100% alert (only if 150% alert not already sent)
      if (spentPercent >= 100 && !budget.alert_100_sent_at && !budget.alert_150_sent_at) {
        await admin.from('notifications').insert({
          tenant_id: tenantId,
          user_id: userId,
          type: 'budget_alert',
          title: 'Budget überschritten',
          body: `${customerName}: ${platformLabel} Budget zu ${Math.round(spentPercent)}% verbraucht.`,
        })
        await admin
          .from('ad_budgets')
          .update({ alert_100_sent_at: new Date().toISOString() })
          .eq('id', budget.id)
      }

      // Threshold alert (default 80%)
      const threshold = budget.alert_threshold_percent ?? 80
      if (spentPercent >= threshold && !budget.alert_80_sent_at && !budget.alert_100_sent_at) {
        await admin.from('notifications').insert({
          tenant_id: tenantId,
          user_id: userId,
          type: 'budget_alert',
          title: `Budget-Warnung: ${Math.round(spentPercent)}% verbraucht`,
          body: `${customerName}: ${platformLabel} Budget hat ${Math.round(spentPercent)}% erreicht.`,
        })
        await admin
          .from('ad_budgets')
          .update({ alert_80_sent_at: new Date().toISOString() })
          .eq('id', budget.id)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Budget ${budget.id}: ${message}`)
    }
  }

  return NextResponse.json({
    synced: syncedCount,
    errors: errors.length > 0 ? errors : undefined,
  })
}
