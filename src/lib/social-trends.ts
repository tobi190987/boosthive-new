/**
 * PROJ-68: Social Media Trend Radar
 *
 * Cache-First-Strategie (analog PROJ-66 brand-trends):
 *   1. Cache prüfen (< 24h alt) → Daten zurückgeben
 *   2. Sonst Plattform-API/Scraper fragen → Cache schreiben → Daten zurückgeben
 *   3. Bei 429 / Netzwerkfehler → Stale-Cache als Fallback (stale=true)
 *   4. Bei vollständig fehlendem API-Key → unavailable=true
 *
 * Externe Dienste (via Env-Vars, alle optional):
 *   • TIKTOK_RESEARCH_API_KEY   → TikTok Research API (primär)
 *   • APIFY_TOKEN               → Apify-Scraper (TikTok-Fallback)
 *   • RAPIDAPI_SOCIAL_TRENDS_KEY → RapidAPI Instagram/YouTube Social Trends
 *
 * Fehlt der API-Key, wird `unavailable` zurückgegeben — das UI zeigt dann
 * einen „API momentan nicht verfügbar"-State.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube'
export type SocialPeriod = 'today' | 'week' | 'month'
export type TrendDirection = 'rising' | 'stable' | 'falling'

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  'tiktok',
  'instagram',
  'youtube',
] as const

export const SOCIAL_PERIODS: readonly SocialPeriod[] = [
  'today',
  'week',
  'month',
] as const

export interface SocialSparklinePoint {
  date: string // ISO date YYYY-MM-DD
  value: number // normalisiert 0–100
}

export interface SocialContentExample {
  id: string
  title: string
  url: string
  thumbnailUrl: string | null
  author?: string | null
  views?: number | null
}

export interface SocialHashtagTrend {
  hashtag: string
  volume: number | null
  direction: TrendDirection
  sparkline: SocialSparklinePoint[]
  examples: SocialContentExample[]
}

export interface SocialTrendPayload {
  hashtags: SocialHashtagTrend[]
}

export interface SocialTrendResponse extends SocialTrendPayload {
  platform: SocialPlatform
  period: SocialPeriod
  category: string | null
  cachedAt: string | null
  stale?: boolean
  unavailable?: boolean
  unavailableReason?: string | null
  availability: {
    tiktok: boolean
    instagram: boolean
    youtube: boolean
  }
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const MAX_HASHTAGS = 20
const MAX_EXAMPLES_PER_HASHTAG = 5

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SocialTrendsRateLimitError extends Error {
  constructor(message = 'Social-Trends-API-Rate-Limit erreicht.') {
    super(message)
    this.name = 'SocialTrendsRateLimitError'
  }
}

export class SocialTrendsApiError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'SocialTrendsApiError'
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Moderations-Filter (BUG-3: Whole-Word-Matching + Leetspeak + Deutsche Begriffe)
// ---------------------------------------------------------------------------

const PROFANITY_BLOCKLIST: readonly string[] = [
  // Englisch
  'porn', 'porno', 'nsfw', 'xxx', 'nude', 'nudes', 'naked',
  'sex', 'sexy', 'sexfilm', 'sexual',
  'onlyfans', 'escort', 'fuck', 'shit', 'ass', 'cock', 'dick',
  'pussy', 'hentai', 'fetish', 'milf', 'explicit', 'adult',
  'erotic', 'erotica', 'rape', 'incest',
  // Deutsch
  'nackt', 'erotik', 'nutte', 'hure', 'schlampe', 'versaut',
  'pornografie', 'pornographie',
]

/** Normalisiert häufige Leetspeak-Varianten (z. B. p0rn → porn). */
function normalizeLeetspeak(value: string): string {
  return value
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
}

function isProfane(hashtag: string): boolean {
  const cleaned = hashtag.toLowerCase().replace(/^#/, '')
  const normalized = normalizeLeetspeak(cleaned)
  return PROFANITY_BLOCKLIST.some((word) => {
    const pattern = new RegExp(`\\b${word}\\b`)
    return pattern.test(cleaned) || pattern.test(normalized)
  })
}

// ---------------------------------------------------------------------------
// Availability (prüft env-vars, keine Live-Pings)
// ---------------------------------------------------------------------------

export function checkPlatformAvailability(): SocialTrendResponse['availability'] {
  const hasKey = Boolean(process.env.SERPAPI_KEY)
  return { tiktok: hasKey, instagram: hasKey, youtube: hasKey }
}

// ---------------------------------------------------------------------------
// Fetcher — alle Plattformen via SerpAPI Google Trends
// ---------------------------------------------------------------------------

interface FetchArgs {
  platform: SocialPlatform
  category: string
  period: SocialPeriod
}

const SERPAPI_TRENDS_BASE = 'https://serpapi.com/search.json'

const PERIOD_TO_SERPAPI: Record<SocialPeriod, string> = {
  today: 'now 1-d',
  week: 'now 7-d',
  month: 'today 1-m',
}

interface SerpapiRelatedQuery {
  query?: string
  value?: number | string
  extracted_value?: number
  link?: string
}

interface SerpapiTimelineEntry {
  date?: string
  values?: Array<{ value?: string | number; extracted_value?: number }>
}

interface SerpapiYouTubeVideo {
  video_id?: string
  title?: string
  link?: string
  thumbnail?: { static?: string; rich?: string }
  channel?: { name?: string }
  views?: number
  view_count?: string
}

async function fetchPlatformTrends(args: FetchArgs): Promise<SocialTrendPayload> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    throw new SocialTrendsApiError('SERPAPI_KEY ist nicht konfiguriert.', 500)
  }
  const key: string = apiKey

  const dateParam = PERIOD_TO_SERPAPI[args.period]

  function trendsUrl(dataType: string): string {
    const u = new URL(SERPAPI_TRENDS_BASE)
    u.searchParams.set('engine', 'google_trends')
    u.searchParams.set('q', args.category)
    u.searchParams.set('data_type', dataType)
    u.searchParams.set('date', dateParam)
    u.searchParams.set('geo', 'DE')
    u.searchParams.set('hl', 'de')
    u.searchParams.set('api_key', key)
    return u.toString()
  }

  // Für YouTube: zusätzlich echte Video-Ergebnisse holen
  const fetchList: Promise<Response>[] = [
    fetch(trendsUrl('RELATED_QUERIES'), { cache: 'no-store' }),
    fetch(trendsUrl('TIMESERIES'), { cache: 'no-store' }),
  ]
  if (args.platform === 'youtube') {
    const ytUrl = new URL(SERPAPI_TRENDS_BASE)
    ytUrl.searchParams.set('engine', 'youtube')
    ytUrl.searchParams.set('search_query', args.category)
    ytUrl.searchParams.set('hl', 'de')
    ytUrl.searchParams.set('gl', 'DE')
    ytUrl.searchParams.set('api_key', key)
    fetchList.push(fetch(ytUrl.toString(), { cache: 'no-store' }))
  }

  const [queriesRes, timelineRes, ytRes] = await Promise.all(fetchList)

  if ([queriesRes, timelineRes, ytRes].some((r) => r?.status === 429)) {
    throw new SocialTrendsRateLimitError()
  }

  // Timeseries → gemeinsame Sparkline-Basis für alle Hashtags
  let baseSparkline: SocialSparklinePoint[] = []
  if (timelineRes.ok) {
    const tJson = (await timelineRes.json().catch(() => null)) as {
      interest_over_time?: { timeline_data?: SerpapiTimelineEntry[] }
    } | null
    baseSparkline = normalizeSparkline(
      (tJson?.interest_over_time?.timeline_data ?? [])
        .map((entry) => {
          const rawDate = entry.date?.split('–')[0].trim() ?? ''
          const date = parseDate(rawDate)
          const val =
            entry.values?.[0]?.extracted_value ??
            Number(entry.values?.[0]?.value ?? NaN)
          if (!date || !Number.isFinite(val)) return null
          return { date, value: safeValue(val) }
        })
        .filter((p): p is SocialSparklinePoint => p !== null)
        .slice(-14)
    )
  }

  // Related Queries → Hashtags
  const hashtags: SocialHashtagTrend[] = []
  if (queriesRes.ok) {
    const qJson = (await queriesRes.json().catch(() => null)) as {
      related_queries?: {
        rising?: SerpapiRelatedQuery[]
        top?: SerpapiRelatedQuery[]
      }
      error?: string
    } | null

    const rising = qJson?.related_queries?.rising ?? []
    const top = qJson?.related_queries?.top ?? []

    // TikTok: Rising-Queries zuerst (neueste Trends)
    // Instagram: Top-Queries zuerst (bewährte Themen)
    // YouTube: Rising zuerst, dann Top
    const ordered =
      args.platform === 'instagram'
        ? [...top, ...rising]
        : [...rising, ...top]

    const seen = new Set<string>()
    for (const item of ordered) {
      const query = item.query?.trim()
      if (!query) continue
      const key = query.toLowerCase()
      if (seen.has(key) || isProfane(query)) continue
      seen.add(key)

      const isRising = rising.some((r) => r.query?.trim().toLowerCase() === key)
      const tag = `#${query.replace(/\s+/g, '').toLowerCase()}`

      hashtags.push({
        hashtag: tag,
        volume: typeof item.extracted_value === 'number' ? item.extracted_value : null,
        direction: isRising ? 'rising' : 'stable',
        sparkline: baseSparkline,
        examples: [],
      })
      if (hashtags.length >= MAX_HASHTAGS) break
    }
  }

  // YouTube: Top-5 Video-Beispiele an den ersten Hashtag hängen
  if (args.platform === 'youtube' && ytRes?.ok) {
    const ytJson = (await ytRes.json().catch(() => null)) as {
      video_results?: SerpapiYouTubeVideo[]
    } | null
    const videos = ytJson?.video_results ?? []
    const examples: SocialContentExample[] = videos
      .slice(0, MAX_EXAMPLES_PER_HASHTAG)
      .map((v, i) => ({
        id: v.video_id ?? `yt-${i}`,
        title: v.title ?? args.category,
        url: v.link ?? '',
        thumbnailUrl: v.thumbnail?.static ?? v.thumbnail?.rich ?? null,
        author: v.channel?.name ?? null,
        views: v.views ?? null,
      }))
      .filter((ex) => ex.url.length > 0)

    if (hashtags.length > 0) {
      hashtags[0].examples = examples
    } else if (examples.length > 0) {
      // Keine Related Queries → zeige Videos unter Kategorie-Hashtag
      hashtags.push({
        hashtag: `#${args.category.replace(/\s+/g, '').toLowerCase()}`,
        volume: null,
        direction: 'stable',
        sparkline: baseSparkline,
        examples,
      })
    }
  }

  return { hashtags }
}

function deriveDirection(
  sparkline: SocialSparklinePoint[],
  rankDiff?: number
): TrendDirection {
  if (typeof rankDiff === 'number') {
    if (rankDiff > 1) return 'rising'
    if (rankDiff < -1) return 'falling'
    return 'stable'
  }
  if (sparkline.length < 2) return 'stable'
  const first = sparkline[0].value
  const last = sparkline[sparkline.length - 1].value
  const delta = last - first
  if (delta > 5) return 'rising'
  if (delta < -5) return 'falling'
  return 'stable'
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * BUG-7: Min-Max-Normalisierung auf 0–100 statt hartes Clampen.
 * Clampen zerstörte Sparkline-Werte wenn Rohvolumina > 100 (z. B. 12.500 Posts/Tag).
 * Alle Werte wurden auf 100 gesetzt → Linie immer flach → direction immer "stable".
 */
function normalizeSparkline(
  points: SocialSparklinePoint[]
): SocialSparklinePoint[] {
  if (points.length === 0) return points
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) {
    // Alle Werte gleich → stabiles Baseline bei 50
    return points.map((p) => ({ ...p, value: 50 }))
  }
  return points.map((p) => ({
    ...p,
    value: Math.round(((p.value - min) / (max - min)) * 100),
  }))
}

function safeValue(value: number): number {
  return Number.isFinite(value) ? value : 0
}

// ---------------------------------------------------------------------------
// Cache-First Public API
// ---------------------------------------------------------------------------

interface CacheRow {
  data: SocialTrendPayload
  unavailable: boolean
  unavailable_reason: string | null
  cached_at: string
}

export interface GetSocialTrendsParams {
  tenantId: string
  customerId: string
  category: string
  platform: SocialPlatform
  period: SocialPeriod
  /** BUG-6: Wenn true, wird kein Live-Fetch ausgelöst. Bei fehlendem Cache → SocialTrendsApiError(409). */
  cacheOnly?: boolean
}

export async function getSocialTrends(
  admin: SupabaseClient,
  params: GetSocialTrendsParams
): Promise<SocialTrendResponse> {
  const { tenantId, customerId, category, platform, period, cacheOnly } = params
  const normalizedCategory = category.trim()
  const availability = checkPlatformAvailability()

  // Plattform nicht verfügbar → unavailable-Response (ohne Fetch)
  if (!availability[platform]) {
    return {
      hashtags: [],
      platform,
      period,
      category: normalizedCategory,
      cachedAt: null,
      unavailable: true,
      unavailableReason: 'SERPAPI_KEY ist nicht konfiguriert.',
      availability,
    }
  }

  // 1) Cache lookup
  const { data: cached } = await admin
    .from('social_trend_cache')
    .select('data, unavailable, unavailable_reason, cached_at')
    .eq('customer_id', customerId)
    .eq('platform', platform)
    .eq('category', normalizedCategory)
    .eq('period', period)
    .maybeSingle<CacheRow>()

  const isFresh =
    cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS

  if (cached && isFresh) {
    return {
      ...cached.data,
      platform,
      period,
      category: normalizedCategory,
      cachedAt: cached.cached_at,
      stale: false,
      unavailable: cached.unavailable,
      unavailableReason: cached.unavailable_reason,
      availability,
    }
  }

  // BUG-6: cacheOnly → kein Live-Fetch, Fehler wenn kein Cache vorhanden
  if (cacheOnly) {
    if (cached) {
      return {
        ...cached.data,
        platform,
        period,
        category: normalizedCategory,
        cachedAt: cached.cached_at,
        stale: true,
        unavailable: cached.unavailable,
        unavailableReason: cached.unavailable_reason,
        availability,
      }
    }
    throw new SocialTrendsApiError(
      'Keine gecachten Daten vorhanden. Bitte erst das Panel öffnen, um Daten zu laden.',
      409
    )
  }

  // 2) Fetch live
  try {
    const fresh = await fetchPlatformTrends({ platform, category: normalizedCategory, period })
    const cachedAt = new Date().toISOString()
    await admin
      .from('social_trend_cache')
      .upsert(
        {
          tenant_id: tenantId,
          customer_id: customerId,
          platform,
          category: normalizedCategory,
          period,
          data: fresh,
          unavailable: false,
          unavailable_reason: null,
          cached_at: cachedAt,
        },
        { onConflict: 'customer_id,platform,category,period' }
      )

    return {
      ...fresh,
      platform,
      period,
      category: normalizedCategory,
      cachedAt,
      stale: false,
      availability,
    }
  } catch (err) {
    // 3) Bei Rate-Limit / API-Fehler: Stale-Cache, falls vorhanden
    if (cached) {
      return {
        ...cached.data,
        platform,
        period,
        category: normalizedCategory,
        cachedAt: cached.cached_at,
        stale: true,
        unavailable: cached.unavailable,
        unavailableReason: cached.unavailable_reason,
        availability,
      }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// CSV-Export
// ---------------------------------------------------------------------------

export function hashtagsToCsv(trends: SocialHashtagTrend[]): string {
  const header = ['Hashtag', 'Plattform-Volumen', 'Trend-Richtung', 'Top-Beispiel-URL']
  const rows = trends.map((t) => [
    escapeCsv(t.hashtag),
    t.volume !== null ? String(t.volume) : '',
    escapeCsv(t.direction),
    escapeCsv(t.examples[0]?.url ?? ''),
  ])
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
