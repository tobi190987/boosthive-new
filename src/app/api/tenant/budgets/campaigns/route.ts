import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, BUDGETS_READ } from '@/lib/rate-limit'
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

// ── GET /api/tenant/budgets/campaigns?customer_id=&platform= ──
// Returns the list of campaigns for a connected ads account.
// Used by the budget form to let admins select which campaigns to track.

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`budgets-read:${tenantId}:${getClientIp(request)}`, BUDGETS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const url = new URL(request.url)
  const customerId = url.searchParams.get('customer_id')
  const platform = url.searchParams.get('platform') as
    | 'google_ads'
    | 'meta_ads'
    | 'tiktok_ads'
    | null

  if (!customerId || !platform) {
    return NextResponse.json({ error: 'customer_id und platform sind erforderlich.' }, { status: 400 })
  }
  if (!['google_ads', 'meta_ads', 'tiktok_ads'].includes(platform)) {
    return NextResponse.json({ error: 'Ungültige Plattform.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify customer belongs to tenant
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

  try {
    if (platform === 'google_ads') {
      const integration = await getGoogleAdsIntegration(tenantId, customerId)
      if (!integration || integration.status === 'disconnected') {
        return NextResponse.json({ campaigns: [], connected: false })
      }
      const credentials = parseGoogleAdsCredentials(integration.credentials_encrypted)
      if (!credentials) return NextResponse.json({ campaigns: [], connected: false })

      const snapshot = await getGoogleAdsDashboardSnapshot(integration, credentials, '30d')
      const campaigns = snapshot.data.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        cost: c.cost,
      }))
      return NextResponse.json({ campaigns, connected: true })
    }

    if (platform === 'meta_ads') {
      const integration = await getMetaAdsIntegration(tenantId, customerId)
      if (!integration || integration.status === 'disconnected') {
        return NextResponse.json({ campaigns: [], connected: false })
      }
      const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
      if (!credentials?.selected_ad_account_id) {
        return NextResponse.json({ campaigns: [], connected: false })
      }

      const snapshot = await getMetaAdsDashboardSnapshot(integration, credentials, '30d')
      const campaigns = snapshot.data.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: 'ACTIVE',
        cost: 0,
      }))
      return NextResponse.json({ campaigns, connected: true })
    }

    if (platform === 'tiktok_ads') {
      const integration = await getTikTokAdsIntegration(tenantId, customerId)
      if (!integration || integration.status === 'disconnected') {
        return NextResponse.json({ campaigns: [], connected: false })
      }
      const credentials = parseTikTokAdsCredentials(integration.credentials_encrypted)
      if (!credentials?.selected_advertiser_id) {
        return NextResponse.json({ campaigns: [], connected: false })
      }

      const snapshot = await getTikTokAdsDashboardSnapshot(integration, credentials, '30d')
      const campaigns = snapshot.data.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status ?? 'ACTIVE',
        cost: c.cost,
      }))
      return NextResponse.json({ campaigns, connected: true })
    }

    return NextResponse.json({ campaigns: [], connected: false })
  } catch {
    // Integration error — return empty list gracefully so UI stays functional
    return NextResponse.json({ campaigns: [], connected: true, error: 'Kampagnen konnten nicht geladen werden.' })
  }
}
