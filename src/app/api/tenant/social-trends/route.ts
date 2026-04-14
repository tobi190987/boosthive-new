import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RateLimitOptions,
} from '@/lib/rate-limit'
import {
  getSocialTrends,
  checkPlatformAvailability,
  SocialTrendsApiError,
  SocialTrendsRateLimitError,
  SOCIAL_PERIODS,
  SOCIAL_PLATFORMS,
  type SocialPeriod,
  type SocialPlatform,
} from '@/lib/social-trends'

// Outbound-API-Calls (TikTok/RapidAPI) sind teuer. Stricter Limit.
// BUG-5: Zwei-Layer-Rate-Limiting:
//   1. IP-basiert (DDoS-Schutz): 30/min pro Tenant+IP
//   2. Tenant-basiert (API-Quota-Schutz): 100/Stunde pro Tenant (verhindert dass ein Tenant alle anderen verdrängt)
const SOCIAL_TRENDS_READ: RateLimitOptions = { limit: 30, windowMs: 60 * 1000 }
const SOCIAL_TRENDS_TENANT_QUOTA: RateLimitOptions = { limit: 100, windowMs: 60 * 60 * 1000 }

const QuerySchema = z.object({
  customer_id: z.string().uuid('Ungültige customer_id.'),
  platform: z.enum(SOCIAL_PLATFORMS as readonly [SocialPlatform, ...SocialPlatform[]]),
  period: z.enum(SOCIAL_PERIODS as readonly [SocialPeriod, ...SocialPeriod[]]),
})

// ---------------------------------------------------------------------------
// GET /api/tenant/social-trends?customer_id=…&platform=tiktok|instagram|youtube&period=today|week|month
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `social-trends-read:${tenantId}:${getClientIp(request)}`,
    SOCIAL_TRENDS_READ
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  // BUG-5: Zusätzliches Tenant-weites Quota-Limit (unabhängig von IP)
  const rlTenant = checkRateLimit(
    `social-trends-tenant:${tenantId}`,
    SOCIAL_TRENDS_TENANT_QUOTA
  )
  if (!rlTenant.allowed) return rateLimitResponse(rlTenant)

  const auth = await requireTenantUser(tenantId)
  if ('error' in auth) return auth.error

  const sp = request.nextUrl.searchParams
  const parsed = QuerySchema.safeParse({
    customer_id: sp.get('customer_id'),
    platform: sp.get('platform'),
    period: sp.get('period'),
  })
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Validierungsfehler.'
    return NextResponse.json({ error: firstIssue }, { status: 400 })
  }

  const { customer_id, platform, period } = parsed.data
  const admin = createAdminClient()

  // Cross-Tenant-Schutz + Kategorie aus Kunden-Datensatz lesen
  const { data: customer } = await admin
    .from('customers')
    .select('id, industry_category')
    .eq('id', customer_id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; industry_category: string | null }>()

  if (!customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const category = customer.industry_category?.trim() ?? ''
  if (category.length < 2) {
    return NextResponse.json(
      {
        error:
          'Für diesen Kunden ist keine Branche hinterlegt. Bitte im Panel oben setzen.',
      },
      { status: 409 }
    )
  }

  try {
    const result = await getSocialTrends(admin, {
      tenantId,
      customerId: customer_id,
      category,
      platform,
      period,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof SocialTrendsRateLimitError) {
      return NextResponse.json(
        { error: 'Social-Trends-API-Limit erreicht. Bitte später erneut versuchen.' },
        { status: 429 }
      )
    }
    if (err instanceof SocialTrendsApiError) {
      if (err.status === 500) {
        console.error('[social-trends] config error', err.message)
        return NextResponse.json(
          {
            // Plattform nicht verfügbar — UI erwartet `unavailable=true` um Tab zu deaktivieren
            hashtags: [],
            platform,
            period,
            category,
            cachedAt: null,
            unavailable: true,
            unavailableReason: 'Plattform-API momentan nicht verfügbar.',
            availability: checkPlatformAvailability(),
          },
          { status: 200 }
        )
      }
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[social-trends] unexpected error', err)
    return NextResponse.json(
      { error: 'Trend-Daten konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
