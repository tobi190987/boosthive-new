import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
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

export const maxDuration = 300

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`
  }

  return request.headers.get('x-vercel-cron') === '1'
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const admin = createAdminClient()

  const now = new Date()
  const targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const budgetMonthDate = `${targetMonth}-01`
  const [year, month] = budgetMonthDate.split('-').map(Number)
  const monthStart = budgetMonthDate
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

  // Load all active tenants
  const { data: tenants, error: tenantsError } = await admin
    .from('tenants')
    .select('id')
    .eq('status', 'active')
    .limit(500)

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 })
  }

  const summary: Array<{ tenantId: string; synced: number; errors: string[] }> = []

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id
    const tenantErrors: string[] = []
    let syncedCount = 0

    // Find primary admin for notifications
    const { data: adminMember } = await admin
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    const notifyUserId = adminMember?.user_id ?? null

    // Load all budgets for this tenant + current month
    const { data: budgets, error: budgetsError } = await admin
      .from('ad_budgets')
      .select('id, customer_id, platform, planned_amount, alert_threshold_percent, alert_80_sent_at, alert_100_sent_at, alert_150_sent_at, customers!inner(name)')
      .eq('tenant_id', tenantId)
      .eq('budget_month', budgetMonthDate)
      .limit(200)

    if (budgetsError || !budgets || budgets.length === 0) {
      summary.push({ tenantId, synced: 0, errors: [] })
      continue
    }

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
          if (!credentials?.google_ads_customer_id) continue

          const snapshot = await getGoogleAdsDashboardSnapshot(integration, credentials, '30d')
          const timeseries = snapshot.data.timeseries ?? []
          dailySpend = timeseries
            .filter((p) => p.label >= monthStart && p.label <= monthEnd)
            .map((p) => ({ date: p.label, amount: p.value }))

          const totalCost = snapshot.data.totalCost
          const clicks = snapshot.data.campaigns.reduce((a, c) => a + (c.clicks ?? 0), 0)
          cpc = totalCost > 0 && clicks > 0 ? totalCost / clicks : null
          cpm = null
          roas = null

        } else if (platform === 'meta_ads') {
          const integration = await getMetaAdsIntegration(tenantId, customerId)
          if (!integration || integration.status === 'disconnected') continue
          const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
          if (!credentials?.selected_ad_account_id) continue

          const snapshot = await getMetaAdsDashboardSnapshot(integration, credentials, '30d')
          const timeseries = snapshot.data.timeseries ?? []
          dailySpend = timeseries
            .filter((p) => p.label >= monthStart && p.label <= monthEnd)
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
            .filter((p) => p.label >= monthStart && p.label <= monthEnd)
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
          tenantErrors.push(`Budget ${budget.id}: ${upsertError.message}`)
          continue
        }

        // Update cached metrics
        await admin
          .from('ad_budgets')
          .update({ cached_cpc: cpc, cached_cpm: cpm, cached_roas: roas, last_synced_at: new Date().toISOString() })
          .eq('id', budget.id)

        syncedCount++

        // Alert notifications (only if admin user found)
        if (notifyUserId) {
          const totalSpent = dailySpend.reduce((a, d) => a + d.amount, 0)
          const plannedAmount = Number(budget.planned_amount)
          if (plannedAmount <= 0) continue

          const spentPercent = (totalSpent / plannedAmount) * 100
          const customerName = (Array.isArray(budget.customers)
            ? (budget.customers as { name: string }[])[0]?.name
            : (budget.customers as { name: string } | null)?.name) ?? 'Unbekannt'
          const platformLabel =
            platform === 'google_ads' ? 'Google Ads' : platform === 'meta_ads' ? 'Meta Ads' : 'TikTok Ads'

          if (spentPercent >= 150 && !budget.alert_150_sent_at) {
            await admin.from('notifications').insert({
              tenant_id: tenantId, user_id: notifyUserId, type: 'budget_alert',
              title: 'Kritische Budget-Überschreitung',
              body: `${customerName}: ${platformLabel} Budget zu ${Math.round(spentPercent)}% verbraucht (über 150%).`,
            })
            await admin.from('ad_budgets').update({ alert_150_sent_at: new Date().toISOString() }).eq('id', budget.id)
          } else if (spentPercent >= 100 && !budget.alert_100_sent_at && !budget.alert_150_sent_at) {
            await admin.from('notifications').insert({
              tenant_id: tenantId, user_id: notifyUserId, type: 'budget_alert',
              title: 'Budget überschritten',
              body: `${customerName}: ${platformLabel} Budget zu ${Math.round(spentPercent)}% verbraucht.`,
            })
            await admin.from('ad_budgets').update({ alert_100_sent_at: new Date().toISOString() }).eq('id', budget.id)
          } else if (spentPercent >= (budget.alert_threshold_percent ?? 80) && !budget.alert_80_sent_at && !budget.alert_100_sent_at) {
            await admin.from('notifications').insert({
              tenant_id: tenantId, user_id: notifyUserId, type: 'budget_alert',
              title: `Budget-Warnung: ${Math.round(spentPercent)}% verbraucht`,
              body: `${customerName}: ${platformLabel} Budget hat ${Math.round(spentPercent)}% erreicht.`,
            })
            await admin.from('ad_budgets').update({ alert_80_sent_at: new Date().toISOString() }).eq('id', budget.id)
          }
        }
      } catch (err) {
        tenantErrors.push(`Budget ${budget.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    summary.push({ tenantId, synced: syncedCount, errors: tenantErrors })
  }

  const totalSynced = summary.reduce((a, s) => a + s.synced, 0)
  const allErrors = summary.flatMap((s) => s.errors)

  return NextResponse.json({
    processed: summary.length,
    totalSynced,
    errors: allErrors.length > 0 ? allErrors : undefined,
  })
}
