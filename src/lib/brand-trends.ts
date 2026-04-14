/**
 * PROJ-66: Google Trends Integration via SerpAPI
 *
 * Cache-First-Strategie:
 *   1. Cache prüfen (< 24h alt) → Daten zurückgeben
 *   2. Sonst SerpAPI fragen → Cache schreiben → Daten zurückgeben
 *   3. Bei 429 / Netzwerkfehler → Stale-Cache als Fallback (mit stale=true)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type TrendPeriod = '7d' | '30d' | '90d'

export const TREND_PERIODS: readonly TrendPeriod[] = ['7d', '30d', '90d'] as const

export interface TrendPoint {
  date: string // ISO date (YYYY-MM-DD)
  value: number // 0–100
}

export interface RelatedItem {
  label: string
  type: 'rising' | 'top'
  value?: number
}

export interface TrendPayload {
  timeline: TrendPoint[]
  relatedQueries: RelatedItem[]
  relatedTopics: RelatedItem[]
}

export interface TrendResponse extends TrendPayload {
  cachedAt: string | null
  stale?: boolean
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const SERPAPI_BASE = 'https://serpapi.com/search.json'

const PERIOD_TO_SERPAPI: Record<TrendPeriod, string> = {
  '7d': 'now 7-d',
  '30d': 'today 1-m',
  '90d': 'today 3-m',
}

export class TrendsRateLimitError extends Error {
  constructor(message = 'SerpAPI rate-limit erreicht.') {
    super(message)
    this.name = 'TrendsRateLimitError'
  }
}

export class TrendsApiError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'TrendsApiError'
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// SerpAPI fetcher
// ---------------------------------------------------------------------------

interface SerpapiTimelineDataItem {
  value?: Array<number | string>
  values?: Array<{ value?: string | number; extracted_value?: number }>
}
interface SerpapiTimelineEntry {
  date?: string
  timestamp?: string
  values?: Array<{ value?: string | number; extracted_value?: number }>
  value?: number | string
}
interface SerpapiRelatedEntry {
  query?: string
  topic?: { title?: string; type?: string }
  value?: number
  extracted_value?: number
}

async function fetchTrendFromSerpapi(
  keyword: string,
  period: TrendPeriod
): Promise<TrendPayload> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    throw new TrendsApiError('SERPAPI_KEY ist nicht konfiguriert.', 500)
  }

  const dateParam = PERIOD_TO_SERPAPI[period]

  // 1) Interest over time
  const timelineUrl = new URL(SERPAPI_BASE)
  timelineUrl.searchParams.set('engine', 'google_trends')
  timelineUrl.searchParams.set('q', keyword)
  timelineUrl.searchParams.set('data_type', 'TIMESERIES')
  timelineUrl.searchParams.set('date', dateParam)
  timelineUrl.searchParams.set('geo', 'DE')
  timelineUrl.searchParams.set('hl', 'de')
  timelineUrl.searchParams.set('api_key', apiKey)

  // 2) Related queries
  const relatedQueriesUrl = new URL(SERPAPI_BASE)
  relatedQueriesUrl.searchParams.set('engine', 'google_trends')
  relatedQueriesUrl.searchParams.set('q', keyword)
  relatedQueriesUrl.searchParams.set('data_type', 'RELATED_QUERIES')
  relatedQueriesUrl.searchParams.set('date', dateParam)
  relatedQueriesUrl.searchParams.set('geo', 'DE')
  relatedQueriesUrl.searchParams.set('hl', 'de')
  relatedQueriesUrl.searchParams.set('api_key', apiKey)

  // 3) Related topics
  const relatedTopicsUrl = new URL(SERPAPI_BASE)
  relatedTopicsUrl.searchParams.set('engine', 'google_trends')
  relatedTopicsUrl.searchParams.set('q', keyword)
  relatedTopicsUrl.searchParams.set('data_type', 'RELATED_TOPICS')
  relatedTopicsUrl.searchParams.set('date', dateParam)
  relatedTopicsUrl.searchParams.set('geo', 'DE')
  relatedTopicsUrl.searchParams.set('hl', 'de')
  relatedTopicsUrl.searchParams.set('api_key', apiKey)

  const [timelineRes, queriesRes, topicsRes] = await Promise.all([
    fetch(timelineUrl.toString(), { cache: 'no-store' }),
    fetch(relatedQueriesUrl.toString(), { cache: 'no-store' }),
    fetch(relatedTopicsUrl.toString(), { cache: 'no-store' }),
  ])

  if (timelineRes.status === 429 || queriesRes.status === 429 || topicsRes.status === 429) {
    throw new TrendsRateLimitError()
  }

  if (!timelineRes.ok) {
    throw new TrendsApiError(
      `SerpAPI timeline error: HTTP ${timelineRes.status}`,
      timelineRes.status
    )
  }

  const timelineJson = (await timelineRes.json()) as {
    interest_over_time?: { timeline_data?: SerpapiTimelineEntry[] }
    error?: string
  }
  if (timelineJson.error) {
    // "no results" ist kein technischer Fehler — leere Payload zurückgeben
    if (
      timelineJson.error.toLowerCase().includes('no results') ||
      timelineJson.error.toLowerCase().includes('hasn') // "hasn't returned any results"
    ) {
      return { timeline: [], relatedQueries: [], relatedTopics: [] }
    }
    throw new TrendsApiError(`SerpAPI: ${timelineJson.error}`, 502)
  }

  const queriesJson = queriesRes.ok
    ? ((await queriesRes.json()) as {
        related_queries?: { rising?: SerpapiRelatedEntry[]; top?: SerpapiRelatedEntry[] }
      })
    : {}
  const topicsJson = topicsRes.ok
    ? ((await topicsRes.json()) as {
        related_topics?: { rising?: SerpapiRelatedEntry[]; top?: SerpapiRelatedEntry[] }
      })
    : {}

  // ---- Parse timeline ----
  const timeline: TrendPoint[] = (timelineJson.interest_over_time?.timeline_data ?? [])
    .map((entry) => {
      const rawValue =
        entry.values?.[0]?.extracted_value ??
        Number(entry.values?.[0]?.value ?? entry.value ?? NaN)
      const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue)
      const dateStr = entry.date ?? ''
      const isoDate = parseSerpapiDate(dateStr) ?? dateStr
      return {
        date: isoDate,
        value: Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0,
      }
    })
    .filter((p) => p.date.length > 0)

  // ---- Parse related queries (top 5: prefer rising, then top) ----
  const relatedQueries: RelatedItem[] = mapRelated(
    queriesJson.related_queries?.rising,
    'rising',
    (e) => e.query
  )
    .concat(
      mapRelated(queriesJson.related_queries?.top, 'top', (e) => e.query)
    )
    .slice(0, 5)

  const relatedTopics: RelatedItem[] = mapRelated(
    topicsJson.related_topics?.rising,
    'rising',
    (e) => e.topic?.title
  )
    .concat(
      mapRelated(topicsJson.related_topics?.top, 'top', (e) => e.topic?.title)
    )
    .slice(0, 5)

  return { timeline, relatedQueries, relatedTopics }
}

function mapRelated(
  entries: SerpapiRelatedEntry[] | undefined,
  type: 'rising' | 'top',
  labelExtractor: (entry: SerpapiRelatedEntry) => string | undefined
): RelatedItem[] {
  if (!entries) return []
  return entries
    .map((entry) => {
      const label = labelExtractor(entry)?.trim()
      if (!label) return null
      return {
        label,
        type,
        value: entry.extracted_value ?? entry.value,
      } as RelatedItem
    })
    .filter((item): item is RelatedItem => item !== null)
}

function parseSerpapiDate(value: string): string | null {
  // SerpAPI liefert z.B. "Apr 1, 2026" oder "Apr 1 – 7, 2026"
  if (!value) return null
  const firstPart = value.split('–')[0].trim()
  const date = new Date(firstPart)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Cache-First Public API
// ---------------------------------------------------------------------------

interface CacheRow {
  data: TrendPayload
  cached_at: string
}

export async function getBrandTrend(
  admin: SupabaseClient,
  params: {
    tenantId: string
    customerId: string
    keyword: string
    period: TrendPeriod
  }
): Promise<TrendResponse> {
  const { tenantId, customerId, keyword, period } = params
  const normalizedKeyword = keyword.trim()

  // 1) Cache lookup
  const { data: cached } = await admin
    .from('brand_trend_cache')
    .select('data, cached_at')
    .eq('customer_id', customerId)
    .eq('keyword', normalizedKeyword)
    .eq('period', period)
    .maybeSingle<CacheRow>()

  const isFresh =
    cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS

  if (cached && isFresh) {
    return { ...cached.data, cachedAt: cached.cached_at, stale: false }
  }

  // 2) Fetch live
  try {
    const fresh = await fetchTrendFromSerpapi(normalizedKeyword, period)
    const cachedAt = new Date().toISOString()

    await admin
      .from('brand_trend_cache')
      .upsert(
        {
          tenant_id: tenantId,
          customer_id: customerId,
          keyword: normalizedKeyword,
          period,
          data: fresh,
          cached_at: cachedAt,
        },
        { onConflict: 'customer_id,keyword,period' }
      )

    return { ...fresh, cachedAt, stale: false }
  } catch (err) {
    // 3) Bei Rate-Limit / API-Fehler: Stale-Cache zurückgeben, falls vorhanden
    if (cached) {
      return { ...cached.data, cachedAt: cached.cached_at, stale: true }
    }
    throw err
  }
}
