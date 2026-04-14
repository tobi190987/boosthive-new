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
  getBrandTrend,
  TrendsApiError,
  TrendsRateLimitError,
  TREND_PERIODS,
  type TrendPeriod,
} from '@/lib/brand-trends'

// Outbound-API-Calls sind teuer (3 SerpAPI-Requests pro Miss). Stricter Limit.
const BRAND_TRENDS_READ: RateLimitOptions = { limit: 30, windowMs: 60 * 1000 }

const QuerySchema = z.object({
  customer_id: z.string().uuid('Ungültige customer_id.'),
  keyword: z
    .string()
    .trim()
    .min(2, 'Keyword muss mindestens 2 Zeichen haben.')
    .max(60, 'Keyword darf maximal 60 Zeichen haben.'),
  period: z.enum(TREND_PERIODS as readonly [TrendPeriod, ...TrendPeriod[]]),
})

// ---------------------------------------------------------------------------
// GET /api/tenant/brand-trends?customer_id=…&keyword=…&period=7d|30d|90d
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `brand-trends-read:${tenantId}:${getClientIp(request)}`,
    BRAND_TRENDS_READ
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const auth = await requireTenantUser(tenantId)
  if ('error' in auth) return auth.error

  const sp = request.nextUrl.searchParams
  const parsed = QuerySchema.safeParse({
    customer_id: sp.get('customer_id'),
    keyword: sp.get('keyword'),
    period: sp.get('period'),
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Validierungsfehler.'
    return NextResponse.json({ error: firstIssue }, { status: 400 })
  }

  const { customer_id, keyword, period } = parsed.data
  const admin = createAdminClient()

  // Customer-Tenant-Zugehörigkeit prüfen (Cross-Tenant-Schutz)
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  // Optional: Keyword muss in brand_keywords des Kunden registriert sein
  // (verhindert beliebige Keyword-Anfragen durch Clients)
  const { data: registered } = await admin
    .from('brand_keywords')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customer_id)
    .eq('keyword', keyword.trim())
    .maybeSingle()

  if (!registered) {
    return NextResponse.json(
      { error: 'Keyword ist für diesen Kunden nicht registriert.' },
      { status: 404 }
    )
  }

  try {
    const result = await getBrandTrend(admin, {
      tenantId,
      customerId: customer_id,
      keyword: keyword.trim(),
      period,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof TrendsRateLimitError) {
      return NextResponse.json(
        { error: 'Google-Trends-API-Limit erreicht. Bitte später erneut versuchen.' },
        { status: 429 }
      )
    }
    if (err instanceof TrendsApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
