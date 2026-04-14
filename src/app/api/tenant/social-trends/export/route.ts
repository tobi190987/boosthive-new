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
  hashtagsToCsv,
  SocialTrendsApiError,
  SocialTrendsRateLimitError,
  SOCIAL_PERIODS,
  SOCIAL_PLATFORMS,
  type SocialPeriod,
  type SocialPlatform,
} from '@/lib/social-trends'

const SOCIAL_TRENDS_EXPORT: RateLimitOptions = { limit: 10, windowMs: 60 * 1000 }

const QuerySchema = z.object({
  customer_id: z.string().uuid('Ungültige customer_id.'),
  platform: z.enum(SOCIAL_PLATFORMS as readonly [SocialPlatform, ...SocialPlatform[]]),
  period: z.enum(SOCIAL_PERIODS as readonly [SocialPeriod, ...SocialPeriod[]]),
})

// ---------------------------------------------------------------------------
// GET /api/tenant/social-trends/export?customer_id=…&platform=…&period=…
// Liefert eine CSV-Datei mit den aktuellen Trending-Hashtags (nutzt Cache).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `social-trends-export:${tenantId}:${getClientIp(request)}`,
    SOCIAL_TRENDS_EXPORT
  )
  if (!rl.allowed) return rateLimitResponse(rl)

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

  const { data: customer } = await admin
    .from('customers')
    .select('id, name, industry_category')
    .eq('id', customer_id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; name: string; industry_category: string | null }>()

  if (!customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const category = customer.industry_category?.trim() ?? ''
  if (category.length < 2) {
    return NextResponse.json(
      { error: 'Für diesen Kunden ist keine Branche hinterlegt.' },
      { status: 409 }
    )
  }

  try {
    // BUG-6: cacheOnly=true verhindert erneuten Live-Fetch beim Export.
    // Wenn kein Cache → 409-Hinweis "Panel zuerst öffnen".
    const result = await getSocialTrends(admin, {
      tenantId,
      customerId: customer_id,
      category,
      platform,
      period,
      cacheOnly: true,
    })
    const csv = hashtagsToCsv(result.hashtags)
    const safeName = customer.name.replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 40)
    const filename = `social-trends_${safeName}_${platform}_${period}.csv`
    // BOM für korrekte Excel-UTF-8-Erkennung
    return new NextResponse('\uFEFF' + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof SocialTrendsRateLimitError) {
      return NextResponse.json(
        { error: 'Social-Trends-API-Limit erreicht.' },
        { status: 429 }
      )
    }
    if (err instanceof SocialTrendsApiError) {
      // 409 = kein Cache vorhanden (BUG-6)
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[social-trends-export] unexpected error', err)
    return NextResponse.json(
      { error: 'CSV-Export konnte nicht erstellt werden.' },
      { status: 500 }
    )
  }
}
