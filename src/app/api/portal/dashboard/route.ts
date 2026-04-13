import { NextRequest, NextResponse } from 'next/server'
import { requirePortalUser } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * GET /api/portal/dashboard
 *
 * Returns read-only marketing metrics for the authenticated portal user.
 * Reads from stored data (keyword_rankings, ad_budgets, customer_integrations)
 * rather than calling external APIs live, keeping the portal fast and simple.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requirePortalUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { customerId } = authResult.auth
  const admin = createAdminClient()

  // Load visibility settings
  const { data: vis } = await admin
    .from('client_portal_visibility')
    .select('show_ga4, show_ads, show_seo, show_reports')
    .eq('customer_id', customerId)
    .maybeSingle()

  const visibility = {
    show_ga4: vis?.show_ga4 ?? true,
    show_ads: vis?.show_ads ?? true,
    show_seo: vis?.show_seo ?? true,
  }

  // Load data in parallel
  const [integrationsResult, keywordResult, budgetResult] = await Promise.all([
    // Check which integrations are connected
    admin
      .from('customer_integrations')
      .select('integration_type, status')
      .eq('customer_id', customerId)
      .in('integration_type', ['ga4', 'google_ads', 'meta_ads', 'tiktok_ads'])
      .in('status', ['connected', 'active'])
      .limit(10),

    // SEO: top keywords from latest ranking snapshot
    visibility.show_seo
      ? admin
          .from('keyword_rankings')
          .select('keyword, position, clicks, impressions, date')
          .eq('customer_id', customerId)
          .order('date', { ascending: false })
          .order('clicks', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),

    // Ads: budget summary
    visibility.show_ads
      ? admin
          .from('ad_budgets')
          .select('name, platform, total_budget, spent_amount, currency, period_start, period_end')
          .eq('customer_id', customerId)
          .eq('tenant_id', tenantId)
          .gte('period_end', new Date().toISOString().slice(0, 10))
          .order('period_start', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),
  ])

  const connectedIntegrations = new Set(
    (integrationsResult.data ?? []).map((i: { integration_type: string }) => i.integration_type)
  )

  // --- SEO data ---
  let seoData = null
  if (visibility.show_seo) {
    const keywords = keywordResult.data ?? []
    if (keywords.length > 0) {
      const avgPosition =
        keywords.reduce((sum: number, k: { position: number }) => sum + k.position, 0) /
        keywords.length

      seoData = {
        avgPosition: {
          label: 'Ø Position',
          value: avgPosition.toFixed(1),
          trend: null,
        },
        topKeywords: keywords.map((k: {
          keyword: string
          position: number
          clicks: number
          impressions: number
        }) => ({
          keyword: k.keyword,
          position: k.position,
          clicks: k.clicks,
          impressions: k.impressions,
        })),
      }
    }
  }

  // --- Ads data ---
  let adsData = null
  if (visibility.show_ads && connectedIntegrations.size > 0) {
    const budgets = budgetResult.data ?? []
    if (budgets.length > 0) {
      const currency = (budgets[0] as { currency: string }).currency ?? 'EUR'
      const totalSpend = budgets.reduce(
        (sum: number, b: { spent_amount: number | null }) => sum + (b.spent_amount ?? 0),
        0
      )

      const campaigns = budgets.map((b: {
        name: string
        platform: string
        spent_amount: number | null
        currency: string
      }) => ({
        name: b.name,
        platform: b.platform,
        spend: b.spent_amount ?? 0,
        roas: null, // ROAS requires live API call — shown as — in UI
        currency: b.currency ?? currency,
      }))

      adsData = { totalSpend, currency, campaigns }
    }
  }

  // --- GA4 data ---
  // GA4 live data requires OAuth credentials — return connected status only.
  // Full GA4 data can be fetched in a future iteration via the existing ga4-api.ts lib.
  const ga4Connected = connectedIntegrations.has('ga4')
  const ga4Data = ga4Connected
    ? null // placeholder: live GA4 call to be added in next iteration
    : null

  return NextResponse.json({
    ga4: ga4Data,
    ads: adsData,
    seo: seoData,
    visibility,
  })
}
