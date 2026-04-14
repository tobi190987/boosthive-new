import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, BUDGETS_READ } from '@/lib/rate-limit'
import {
  getGoogleAdsIntegration,
  parseGoogleAdsCredentials,
  getGoogleAdsCampaignDailySpend,
} from '@/lib/google-ads-api'
import {
  getMetaAdsIntegration,
  parseMetaAdsCredentials,
  getMetaAdsCampaignDailySpend,
} from '@/lib/meta-ads-api'
import {
  getTikTokAdsIntegration,
  parseTikTokAdsCredentials,
  getTikTokCampaignDailySpend,
} from '@/lib/tiktok-ads-api'

// ── GET /api/tenant/budgets/[id]/campaign-spend ──
// Returns per-campaign spend totals for the budget's month.
// Only meaningful when the budget has campaign_ids and an active integration.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-read:${tenantId}:${getClientIp(request)}`, BUDGETS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const admin = createAdminClient()

  const { data: budget, error: budgetError } = await admin
    .from('ad_budgets')
    .select('id, tenant_id, customer_id, platform, campaign_ids, budget_month')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (budgetError) return NextResponse.json({ error: budgetError.message }, { status: 500 })
  if (!budget) return NextResponse.json({ error: 'Budget nicht gefunden.' }, { status: 404 })

  const campaignIds = (budget.campaign_ids as string[] | null) ?? null
  if (!campaignIds || campaignIds.length === 0) {
    return NextResponse.json({ campaigns: [] })
  }

  const platform = budget.platform as 'google_ads' | 'meta_ads' | 'tiktok_ads'
  const customerId = budget.customer_id
  const budgetMonth = budget.budget_month as string
  const [year, month] = budgetMonth.split('-').map(Number)
  const monthStart = budgetMonth
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

  try {
    type CampaignSpendEntry = { campaignId: string; campaignName: string; date: string; cost: number }
    let rows: CampaignSpendEntry[] = []

    if (platform === 'google_ads') {
      const integration = await getGoogleAdsIntegration(tenantId, customerId)
      if (!integration || integration.status === 'disconnected') {
        return NextResponse.json({ campaigns: [], connected: false })
      }
      const credentials = parseGoogleAdsCredentials(integration.credentials_encrypted)
      if (!credentials) return NextResponse.json({ campaigns: [], connected: false })

      rows = await getGoogleAdsCampaignDailySpend(integration, credentials, {
        startDate: monthStart,
        endDate: monthEnd,
      })
    } else if (platform === 'meta_ads') {
      const integration = await getMetaAdsIntegration(tenantId, customerId)
      if (!integration || integration.status === 'disconnected') {
        return NextResponse.json({ campaigns: [], connected: false })
      }
      const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
      if (!credentials?.selected_ad_account_id) return NextResponse.json({ campaigns: [], connected: false })

      rows = await getMetaAdsCampaignDailySpend(integration, credentials, {
        startDate: monthStart,
        endDate: monthEnd,
      })
    } else if (platform === 'tiktok_ads') {
      const integration = await getTikTokAdsIntegration(tenantId, customerId)
      if (!integration || integration.status === 'disconnected') {
        return NextResponse.json({ campaigns: [], connected: false })
      }
      const credentials = parseTikTokAdsCredentials(integration.credentials_encrypted)
      if (!credentials?.selected_advertiser_id) return NextResponse.json({ campaigns: [], connected: false })

      rows = await getTikTokCampaignDailySpend(integration, credentials, {
        startDate: monthStart,
        endDate: monthEnd,
      })
    }

    // Filter to campaign_ids in this budget and aggregate per campaign
    const filtered = rows.filter((r) => campaignIds.includes(r.campaignId))

    const byId = new Map<string, { campaignId: string; campaignName: string; totalSpend: number }>()
    for (const r of filtered) {
      const existing = byId.get(r.campaignId)
      if (existing) {
        existing.totalSpend += r.cost
      } else {
        byId.set(r.campaignId, {
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          totalSpend: r.cost,
        })
      }
    }

    // Keep order stable: highest spend first
    const campaigns = Array.from(byId.values()).sort((a, b) => b.totalSpend - a.totalSpend)

    return NextResponse.json({ campaigns, connected: true })
  } catch {
    return NextResponse.json({ campaigns: [], connected: true, error: 'Kampagnen-Daten konnten nicht geladen werden.' })
  }
}
