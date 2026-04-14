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
  const hasTikTok = Boolean(
    process.env.TIKTOK_RESEARCH_API_KEY || process.env.APIFY_TOKEN
  )
  const hasRapid = Boolean(process.env.RAPIDAPI_SOCIAL_TRENDS_KEY)
  return {
    tiktok: hasTikTok,
    instagram: hasRapid,
    youtube: hasRapid,
  }
}

// ---------------------------------------------------------------------------
// Fetcher (Plattform-spezifisch)
// ---------------------------------------------------------------------------

interface FetchArgs {
  platform: SocialPlatform
  category: string
  period: SocialPeriod
}

async function fetchPlatformTrends(args: FetchArgs): Promise<SocialTrendPayload> {
  const { platform } = args
  if (platform === 'tiktok') return fetchTikTokTrends(args)
  if (platform === 'instagram') return fetchInstagramTrends(args)
  return fetchYouTubeTrends(args)
}

// ─── TikTok ──────────────────────────────────────────────────
async function fetchTikTokTrends(args: FetchArgs): Promise<SocialTrendPayload> {
  const apiKey = process.env.TIKTOK_RESEARCH_API_KEY
  const apifyToken = process.env.APIFY_TOKEN
  if (!apiKey && !apifyToken) {
    throw new SocialTrendsApiError(
      'Weder TIKTOK_RESEARCH_API_KEY noch APIFY_TOKEN gesetzt.',
      500
    )
  }

  // TikTok Research API (primär)
  if (apiKey) {
    const url = new URL('https://open.tiktokapis.com/v2/research/hashtag/query/')
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: { keyword: args.category },
        period: mapPeriodForTikTok(args.period),
        max_count: MAX_HASHTAGS,
      }),
      cache: 'no-store',
    })
    if (res.status === 429) throw new SocialTrendsRateLimitError()
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as unknown
      const parsed = parseTikTokResponse(json)
      if (parsed.hashtags.length > 0) return parsed
    }
    // sonst Fallback auf Apify
  }

  if (apifyToken) {
    return fetchTikTokViaApify(args, apifyToken)
  }

  return { hashtags: [] }
}

function mapPeriodForTikTok(period: SocialPeriod): number {
  // TikTok Research API erwartet Tage
  if (period === 'today') return 1
  if (period === 'week') return 7
  return 30
}

interface TikTokApiResponse {
  data?: {
    hashtags?: Array<{
      hashtag_name?: string
      publish_cnt?: number
      view_cnt?: number
      rank_diff?: number
      trend?: Array<{ time?: string; value?: number }>
      videos?: Array<{
        id?: string
        title?: string
        url?: string
        cover_image_url?: string
        author?: { unique_id?: string }
        view_count?: number
      }>
    }>
  }
}

function parseTikTokResponse(raw: unknown): SocialTrendPayload {
  const data = (raw as TikTokApiResponse)?.data
  const list = data?.hashtags ?? []
  const hashtags: SocialHashtagTrend[] = []
  for (const entry of list) {
    const name = entry.hashtag_name?.trim()
    if (!name) continue
    if (isProfane(name)) continue
    const sparkline = normalizeSparkline(
      (entry.trend ?? [])
        .map((point) => {
          const date = parseDate(point.time)
          if (!date) return null
          return { date, value: safeValue(point.value ?? 0) }
        })
        .filter((p): p is SocialSparklinePoint => p !== null)
        .slice(-14)
    )
    hashtags.push({
      hashtag: name.startsWith('#') ? name : `#${name}`,
      volume: entry.publish_cnt ?? entry.view_cnt ?? null,
      direction: deriveDirection(sparkline, entry.rank_diff),
      sparkline,
      examples: (entry.videos ?? [])
        .slice(0, MAX_EXAMPLES_PER_HASHTAG)
        .map((v, index) => ({
          id: v.id ?? `tiktok-${name}-${index}`,
          title: v.title ?? name,
          url: v.url ?? '',
          thumbnailUrl: v.cover_image_url ?? null,
          author: v.author?.unique_id ?? null,
          views: v.view_count ?? null,
        }))
        .filter((ex) => ex.url.length > 0),
    })
    if (hashtags.length >= MAX_HASHTAGS) break
  }
  return { hashtags }
}

async function fetchTikTokViaApify(
  args: FetchArgs,
  token: string
): Promise<SocialTrendPayload> {
  const url = new URL(
    'https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items'
  )
  url.searchParams.set('token', token)
  url.searchParams.set('timeout', '60')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hashtags: [args.category],
      resultsPerPage: MAX_HASHTAGS,
      shouldDownloadVideos: false,
    }),
    cache: 'no-store',
  })
  if (res.status === 429) throw new SocialTrendsRateLimitError()
  if (!res.ok) {
    throw new SocialTrendsApiError(
      `Apify TikTok-Scraper Fehler: HTTP ${res.status}`,
      res.status
    )
  }
  const items = (await res.json().catch(() => [])) as Array<{
    hashtags?: Array<{ name?: string }>
    playCount?: number
    webVideoUrl?: string
    text?: string
    authorMeta?: { name?: string }
    covers?: { default?: string }
    id?: string
  }>

  // Aggregiere Hashtag-Counts aus Apify-Videos
  const aggregate = new Map<
    string,
    { volume: number; examples: SocialContentExample[] }
  >()
  for (const item of items) {
    const videoTags = item.hashtags ?? []
    for (const tag of videoTags) {
      const name = tag.name?.trim()
      if (!name || isProfane(name)) continue
      const key = name.startsWith('#') ? name : `#${name}`
      const entry = aggregate.get(key) ?? { volume: 0, examples: [] }
      entry.volume += item.playCount ?? 0
      if (entry.examples.length < MAX_EXAMPLES_PER_HASHTAG && item.webVideoUrl) {
        entry.examples.push({
          id: item.id ?? `${key}-${entry.examples.length}`,
          title: item.text ?? key,
          url: item.webVideoUrl,
          thumbnailUrl: item.covers?.default ?? null,
          author: item.authorMeta?.name ?? null,
          views: item.playCount ?? null,
        })
      }
      aggregate.set(key, entry)
    }
  }

  const hashtags: SocialHashtagTrend[] = Array.from(aggregate.entries())
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, MAX_HASHTAGS)
    .map(([name, entry]) => ({
      hashtag: name,
      volume: entry.volume,
      direction: 'stable' as TrendDirection,
      sparkline: [], // Apify liefert keine Timeline
      examples: entry.examples,
    }))

  return { hashtags }
}

// ─── Instagram / YouTube via RapidAPI ───────────────────────
async function fetchInstagramTrends(args: FetchArgs): Promise<SocialTrendPayload> {
  return fetchRapidApiTrends({ ...args, platform: 'instagram' })
}

async function fetchYouTubeTrends(args: FetchArgs): Promise<SocialTrendPayload> {
  return fetchRapidApiTrends({ ...args, platform: 'youtube' })
}

async function fetchRapidApiTrends(args: FetchArgs): Promise<SocialTrendPayload> {
  const apiKey = process.env.RAPIDAPI_SOCIAL_TRENDS_KEY
  const host =
    process.env.RAPIDAPI_SOCIAL_TRENDS_HOST ?? 'social-trends.p.rapidapi.com'
  if (!apiKey) {
    throw new SocialTrendsApiError('RAPIDAPI_SOCIAL_TRENDS_KEY ist nicht konfiguriert.', 500)
  }

  const url = new URL(`https://${host}/hashtags/trending`)
  url.searchParams.set('platform', args.platform)
  url.searchParams.set('query', args.category)
  url.searchParams.set('period', args.period)
  url.searchParams.set('limit', String(MAX_HASHTAGS))

  const res = await fetch(url.toString(), {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': host,
    },
    cache: 'no-store',
  })
  if (res.status === 429) throw new SocialTrendsRateLimitError()
  if (!res.ok) {
    throw new SocialTrendsApiError(
      `RapidAPI ${args.platform} error: HTTP ${res.status}`,
      res.status
    )
  }
  const json = (await res.json().catch(() => null)) as unknown
  return parseRapidApiResponse(json)
}

interface RapidApiResponse {
  hashtags?: Array<{
    tag?: string
    hashtag?: string
    volume?: number
    posts?: number
    direction?: string
    sparkline?: Array<{ date?: string; value?: number }>
    history?: Array<{ date?: string; value?: number }>
    examples?: Array<{
      id?: string
      title?: string
      caption?: string
      url?: string
      link?: string
      thumbnail?: string
      cover?: string
      author?: string
      views?: number
      play_count?: number
    }>
  }>
}

function parseRapidApiResponse(raw: unknown): SocialTrendPayload {
  const list = (raw as RapidApiResponse)?.hashtags ?? []
  const hashtags: SocialHashtagTrend[] = []
  for (const entry of list) {
    const rawName = (entry.tag ?? entry.hashtag ?? '').trim()
    if (!rawName) continue
    if (isProfane(rawName)) continue
    const name = rawName.startsWith('#') ? rawName : `#${rawName}`
    const spark = normalizeSparkline(
      (entry.sparkline ?? entry.history ?? [])
        .map((p) => {
          const date = parseDate(p.date)
          if (!date) return null
          return { date, value: safeValue(p.value ?? 0) }
        })
        .filter((p): p is SocialSparklinePoint => p !== null)
        .slice(-14)
    )

    hashtags.push({
      hashtag: name,
      volume: entry.volume ?? entry.posts ?? null,
      direction: normalizeDirection(entry.direction) ?? deriveDirection(spark),
      sparkline: spark,
      examples: (entry.examples ?? [])
        .slice(0, MAX_EXAMPLES_PER_HASHTAG)
        .map((ex, index) => {
          const url = ex.url ?? ex.link ?? ''
          return {
            id: ex.id ?? `${name}-${index}`,
            title: ex.title ?? ex.caption ?? name,
            url,
            thumbnailUrl: ex.thumbnail ?? ex.cover ?? null,
            author: ex.author ?? null,
            views: ex.views ?? ex.play_count ?? null,
          }
        })
        .filter((ex) => ex.url.length > 0),
    })
    if (hashtags.length >= MAX_HASHTAGS) break
  }
  return { hashtags }
}

function normalizeDirection(value: string | undefined): TrendDirection | null {
  if (!value) return null
  const v = value.toLowerCase()
  if (v === 'rising' || v === 'up' || v === 'increasing') return 'rising'
  if (v === 'falling' || v === 'down' || v === 'decreasing') return 'falling'
  if (v === 'stable' || v === 'flat') return 'stable'
  return null
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
      unavailableReason:
        platform === 'tiktok'
          ? 'TikTok-API-Key fehlt. Bitte TIKTOK_RESEARCH_API_KEY oder APIFY_TOKEN setzen.'
          : 'RapidAPI-Key fehlt. Bitte RAPIDAPI_SOCIAL_TRENDS_KEY setzen.',
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
