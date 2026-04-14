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
  getBrandMentions,
  maybeTriggerSentimentAlert,
  MentionsApiError,
  MentionsRateLimitError,
  SentimentClassificationError,
  MENTION_PERIODS,
  type MentionPeriod,
} from '@/lib/brand-mentions'

// Outbound-API-Calls (Exa.ai + OpenRouter) sind teuer. Stricter Limit.
const BRAND_MENTIONS_READ: RateLimitOptions = { limit: 30, windowMs: 60 * 1000 }

const QuerySchema = z.object({
  customer_id: z.string().uuid('Ungültige customer_id.'),
  keyword: z
    .string()
    .trim()
    .min(2, 'Keyword muss mindestens 2 Zeichen haben.')
    .max(60, 'Keyword darf maximal 60 Zeichen haben.'),
  period: z.enum(
    MENTION_PERIODS as readonly [MentionPeriod, ...MentionPeriod[]]
  ),
})

// ---------------------------------------------------------------------------
// GET /api/tenant/brand-mentions?customer_id=…&keyword=…&period=7d|30d|90d
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `brand-mentions-read:${tenantId}:${getClientIp(request)}`,
    BRAND_MENTIONS_READ
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
  // BUG-8 Fix: Keyword normalisieren (lowercase) für case-insensitiven Vergleich
  const normalizedKeyword = keyword.trim().toLowerCase()
  const admin = createAdminClient()

  // Cross-Tenant-Schutz: Kunde muss im aktiven Tenant liegen
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

  // Keyword muss registriert sein (verhindert beliebige Exa-Aufrufe).
  // BUG-8: ilike für case-insensitiven exakten Match (kein Wildcard)
  const { data: keywordRow } = await admin
    .from('brand_keywords')
    .select('id, sentiment_alert_threshold')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customer_id)
    .ilike('keyword', normalizedKeyword)
    .maybeSingle<{ id: string; sentiment_alert_threshold: number | null }>()

  if (!keywordRow) {
    return NextResponse.json(
      { error: 'Keyword ist für diesen Kunden nicht registriert.' },
      { status: 404 }
    )
  }

  try {
    const result = await getBrandMentions(admin, {
      tenantId,
      customerId: customer_id,
      keyword: normalizedKeyword,
      period,
    })

    // Alert-Trigger (best-effort, schluckt eigene Fehler)
    await maybeTriggerSentimentAlert(admin, {
      tenantId,
      customerId: customer_id,
      keyword: normalizedKeyword,
      period,
      sentimentScore: result.sentimentScore,
      threshold: keywordRow.sentiment_alert_threshold,
    })

    return NextResponse.json({
      ...result,
      alertThreshold: keywordRow.sentiment_alert_threshold,
      keywordId: keywordRow.id,
    })
  } catch (err) {
    if (err instanceof MentionsRateLimitError) {
      return NextResponse.json(
        { error: 'Mentions-API-Limit erreicht. Bitte später erneut versuchen.' },
        { status: 429 }
      )
    }
    if (err instanceof MentionsApiError) {
      // BUG-9 Fix: Config-Fehler (status 500) nicht mit internem Text leaken
      if (err.status === 500) {
        console.error('[brand-mentions] config error', err.message)
        return NextResponse.json(
          { error: 'Mentions-Dienst ist momentan nicht verfügbar.' },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof SentimentClassificationError) {
      // Sollte nicht hier ankommen (wird intern behandelt), aber als Fallback
      console.error('[brand-mentions] sentiment error escaped', err.message)
      return NextResponse.json(
        { error: 'Sentiment-Analyse temporär nicht verfügbar.' },
        { status: 503 }
      )
    }
    console.error('[brand-mentions] unexpected error', err)
    return NextResponse.json(
      { error: 'Mentions konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
