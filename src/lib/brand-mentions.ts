/**
 * PROJ-67: Brand Mention Monitoring & Sentiment Analyse
 *
 * Cache-First-Strategie (analog zu PROJ-66):
 *   1. Cache prüfen (< 24h alt) → Daten zurückgeben
 *   2. Sonst Exa.ai Search API fragen → max. 200 Mentions
 *   3. Sentiment-Klassifikation via OpenRouter / Claude Haiku (batch à 20)
 *   4. Ergebnis + Score in brand_mention_cache speichern
 *   5. Bei Exa/OpenRouter-Fehler → Stale-Cache als Fallback (stale = true)
 *
 * Sentiment-Score = (positive * 100 + neutral * 50 + negative * 0) / total
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type MentionPeriod = '7d' | '30d' | '90d'

export const MENTION_PERIODS: readonly MentionPeriod[] = ['7d', '30d', '90d'] as const

export type SentimentLabel = 'positive' | 'neutral' | 'negative'
export type MentionSource = 'news' | 'blog' | 'forum' | 'social'

export interface Mention {
  id: string
  title: string
  url: string
  source: MentionSource
  sourceName: string
  publishedAt: string // ISO date
  snippet: string
  sentiment: SentimentLabel
}

export interface MentionDistribution {
  positive: number
  neutral: number
  negative: number
}

export interface MentionPayload {
  mentions: Mention[]
  total: number
  truncated: boolean
  sentimentScore: number | null
  distribution: MentionDistribution
  /** false wenn Sentiment-Klassifikation für diesen Datensatz fehlschlug */
  sentimentReliable: boolean
}

export interface MentionResponse extends MentionPayload {
  cachedAt: string | null
  alertThreshold: number | null
  keywordId: string | null
  stale?: boolean
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const MAX_MENTIONS = 200
const SENTIMENT_BATCH_SIZE = 20
const EXA_BASE = 'https://api.exa.ai/search'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const SENTIMENT_MODEL = 'anthropic/claude-3.5-haiku'

const PERIOD_TO_DAYS: Record<MentionPeriod, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export class MentionsRateLimitError extends Error {
  constructor(message = 'Mentions-API-Limit erreicht.') {
    super(message)
    this.name = 'MentionsRateLimitError'
  }
}

export class MentionsApiError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'MentionsApiError'
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Exa.ai Search
// ---------------------------------------------------------------------------

interface ExaSearchResult {
  id?: string
  url?: string
  title?: string
  publishedDate?: string
  text?: string
  highlights?: string[]
  author?: string
}

interface ExaSearchResponse {
  results?: ExaSearchResult[]
  error?: string
}

async function fetchMentionsFromExa(
  keyword: string,
  period: MentionPeriod
): Promise<Array<Omit<Mention, 'sentiment'>>> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    throw new MentionsApiError('EXA_API_KEY ist nicht konfiguriert.', 500)
  }

  const days = PERIOD_TO_DAYS[period]
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const res = await fetch(EXA_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query: `"${keyword}"`,
      type: 'neural',
      useAutoprompt: true,
      numResults: MAX_MENTIONS,
      startPublishedDate: `${startDate}T00:00:00.000Z`,
      contents: {
        highlights: { numSentences: 2, highlightsPerUrl: 1 },
      },
    }),
    cache: 'no-store',
  })

  if (res.status === 429) {
    throw new MentionsRateLimitError('Exa.ai Rate-Limit erreicht.')
  }
  if (!res.ok) {
    throw new MentionsApiError(`Exa.ai Fehler: HTTP ${res.status}`, res.status)
  }

  const json = (await res.json()) as ExaSearchResponse
  if (json.error) {
    throw new MentionsApiError(`Exa.ai: ${json.error}`, 502)
  }

  const results = json.results ?? []
  return results.slice(0, MAX_MENTIONS).map((entry, idx) => {
    const url = entry.url?.trim() ?? ''
    const hostname = safeHostname(url)
    const snippet =
      (entry.highlights?.[0]?.trim() || entry.text?.trim() || '').slice(0, 500)

    return {
      id: entry.id || `${idx}-${hostname}`,
      title: (entry.title?.trim() || hostname || 'Unbekannt').slice(0, 240),
      url,
      source: classifySource(hostname, url),
      sourceName: hostname || 'Unbekannt',
      publishedAt: normalizeIsoDate(entry.publishedDate) ?? new Date().toISOString(),
      snippet,
    }
  })
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function classifySource(hostname: string, url: string): MentionSource {
  const h = hostname.toLowerCase()
  const u = url.toLowerCase()
  const socialHosts = [
    'twitter.com',
    'x.com',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'tiktok.com',
    'youtube.com',
    'reddit.com',
    'threads.net',
    'mastodon.social',
  ]
  if (socialHosts.some((s) => h === s || h.endsWith(`.${s}`))) return 'social'

  const forumHints = ['forum', 'community', 'stackoverflow.com', 'stackexchange', 'discuss']
  if (forumHints.some((f) => h.includes(f) || u.includes(`/${f}`))) return 'forum'

  const blogHints = ['blog', 'medium.com', 'substack.com', 'wordpress', 'ghost.io']
  if (blogHints.some((b) => h.includes(b) || u.includes(`/${b}`))) return 'blog'

  return 'news'
}

function normalizeIsoDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

// ---------------------------------------------------------------------------
// Sentiment Classification (OpenRouter / Claude Haiku)
// ---------------------------------------------------------------------------

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

/** BUG-4/5: Signalisiert, ob Sentiment-Klassifikation fehlschlug (kein Cache-Write bei false) */
export class SentimentClassificationError extends Error {
  constructor(message = 'Sentiment-Klassifikation nicht verfügbar.') {
    super(message)
    this.name = 'SentimentClassificationError'
  }
}

async function classifyBatch(
  snippets: string[]
): Promise<SentimentLabel[]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    // Ohne Key: Neutral-Fallback (Spec: "Neutral als Fallback")
    return snippets.map(() => 'neutral')
  }

  const prompt = [
    'Klassifiziere das Sentiment jedes Snippets als "positive", "neutral" oder "negative".',
    'Antworte AUSSCHLIESSLICH mit einem JSON-Array aus Strings in exakt der Reihenfolge der Eingabe.',
    'Beispielantwort: ["positive","neutral","negative"]',
    'Snippets:',
    JSON.stringify(snippets),
  ].join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://boost-hive.de',
        'X-Title': 'BoostHive',
      },
      body: JSON.stringify({
        model: SENTIMENT_MODEL,
        max_tokens: 400,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Du bist ein mehrsprachiger Sentiment-Klassifikator. Antworte nur mit dem JSON-Array.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (res.status === 429) {
      throw new MentionsRateLimitError('OpenRouter Rate-Limit erreicht.')
    }
    if (!res.ok) {
      // BUG-4/5 Fix: Nicht auf neutral fallen lassen und cachen — stattdessen
      // Fehler signalisieren, damit der Aufrufer den Cache-Write überspringt.
      throw new SentimentClassificationError(
        `OpenRouter HTTP ${res.status}`
      )
    }

    const json = (await res.json()) as OpenRouterResponse
    const content = json.choices?.[0]?.message?.content ?? ''
    const parsed = parseSentimentArray(content, snippets.length)
    return parsed
  } catch (err) {
    if (err instanceof MentionsRateLimitError) throw err
    if (err instanceof SentimentClassificationError) throw err
    throw new SentimentClassificationError(
      err instanceof Error ? err.message : 'Unbekannter Fehler.'
    )
  } finally {
    clearTimeout(timeout)
  }
}

function parseSentimentArray(raw: string, expected: number): SentimentLabel[] {
  // Extrahiere erstes JSON-Array aus dem Antworttext
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return Array(expected).fill('neutral')
  try {
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return Array(expected).fill('neutral')
    return parsed
      .slice(0, expected)
      .map((v) => normalizeLabel(typeof v === 'string' ? v : ''))
      .concat(Array(Math.max(0, expected - parsed.length)).fill('neutral'))
      .slice(0, expected) as SentimentLabel[]
  } catch {
    return Array(expected).fill('neutral')
  }
}

function normalizeLabel(value: string): SentimentLabel {
  const v = value.trim().toLowerCase()
  if (v.startsWith('pos')) return 'positive'
  if (v.startsWith('neg')) return 'negative'
  return 'neutral'
}

/** BUG-11 Fix: Batches parallel ausführen statt sequentiell (10 Batches à 15s → ~15s statt ~150s) */
async function classifyMentions(
  rawMentions: Array<Omit<Mention, 'sentiment'>>
): Promise<{ mentions: Mention[]; reliable: boolean }> {
  const batches: Array<Array<Omit<Mention, 'sentiment'>>> = []
  for (let i = 0; i < rawMentions.length; i += SENTIMENT_BATCH_SIZE) {
    batches.push(rawMentions.slice(i, i + SENTIMENT_BATCH_SIZE))
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const snippets = batch.map((m) =>
        `${m.title}. ${m.snippet}`.trim().slice(0, 600)
      )
      // BUG-4/5: SentimentClassificationError hochwubbeln — Aufrufer entscheidet
      const labels = await classifyBatch(snippets)
      return batch.map((m, idx) => ({
        ...m,
        sentiment: labels[idx] ?? 'neutral',
      }))
    })
  )

  return { mentions: results.flat(), reliable: true }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function buildPayload(
  mentions: Mention[],
  totalFound: number,
  truncated: boolean,
  sentimentReliable = true
): MentionPayload {
  const distribution: MentionDistribution = {
    positive: 0,
    neutral: 0,
    negative: 0,
  }
  for (const m of mentions) distribution[m.sentiment] += 1

  const total = mentions.length
  const sentimentScore =
    total === 0
      ? null
      : Math.round(
          (distribution.positive * 100 + distribution.neutral * 50) / total
        )

  return {
    mentions,
    total: totalFound,
    truncated,
    sentimentScore,
    distribution,
    sentimentReliable,
  }
}

// ---------------------------------------------------------------------------
// Cache-First Public API
// ---------------------------------------------------------------------------

interface MentionCacheRow {
  mentions: Mention[]
  sentiment_score: number | null
  positive_count: number
  neutral_count: number
  negative_count: number
  total_found: number
  truncated: boolean
  cached_at: string
}

export async function getBrandMentions(
  admin: SupabaseClient,
  params: {
    tenantId: string
    customerId: string
    keyword: string
    period: MentionPeriod
  }
): Promise<Omit<MentionResponse, 'alertThreshold' | 'keywordId'>> {
  const { tenantId, customerId, keyword, period } = params
  // BUG-8 Fix: keyword-Vergleich case-insensitiv — in Cache lowercase normalisieren
  const normalizedKeyword = keyword.trim().toLowerCase()

  // 1) Cache lookup (BUG-8: ilike für case-insensitiven Match)
  const { data: cached } = await admin
    .from('brand_mention_cache')
    .select(
      'mentions, sentiment_score, positive_count, neutral_count, negative_count, total_found, truncated, cached_at'
    )
    .eq('customer_id', customerId)
    .ilike('keyword', normalizedKeyword)
    .eq('period', period)
    .maybeSingle<MentionCacheRow>()

  const isFresh =
    cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS

  if (cached && isFresh) {
    return {
      mentions: cached.mentions ?? [],
      total: cached.total_found,
      truncated: cached.truncated,
      sentimentScore: cached.sentiment_score,
      distribution: {
        positive: cached.positive_count,
        neutral: cached.neutral_count,
        negative: cached.negative_count,
      },
      cachedAt: cached.cached_at,
      sentimentReliable: true,
      stale: false,
    }
  }

  // 2) Fetch live
  try {
    const rawMentions = await fetchMentionsFromExa(normalizedKeyword, period)
    const totalFound = rawMentions.length
    const truncated = totalFound >= MAX_MENTIONS

    let withSentiment: Mention[]
    let sentimentReliable = true

    try {
      const classified = await classifyMentions(rawMentions)
      withSentiment = classified.mentions
    } catch (sentimentErr) {
      if (sentimentErr instanceof MentionsRateLimitError) throw sentimentErr
      // BUG-4/5 Fix: Sentiment-Fehler → neutral-Fallback, aber NICHT cachen
      sentimentReliable = false
      withSentiment = rawMentions.map((m) => ({ ...m, sentiment: 'neutral' as SentimentLabel }))
      console.error(
        '[brand-mentions] sentiment classification failed',
        sentimentErr instanceof Error ? sentimentErr.message : sentimentErr
      )
    }

    const payload = buildPayload(withSentiment, totalFound, truncated, sentimentReliable)

    // BUG-4/5 Fix: Nur cachen wenn Sentiment zuverlässig ist
    if (sentimentReliable) {
      const cachedAt = new Date().toISOString()
      const { error: upsertError } = await admin
        .from('brand_mention_cache')
        .upsert(
          {
            tenant_id: tenantId,
            customer_id: customerId,
            keyword: normalizedKeyword,
            period,
            mentions: payload.mentions,
            sentiment_score: payload.sentimentScore,
            positive_count: payload.distribution.positive,
            neutral_count: payload.distribution.neutral,
            negative_count: payload.distribution.negative,
            total_found: payload.total,
            truncated: payload.truncated,
            cached_at: cachedAt,
          },
          { onConflict: 'customer_id,keyword,period' }
        )

      if (upsertError) {
        console.error('[brand-mentions] cache upsert failed', upsertError.message)
      }

      return { ...payload, cachedAt, stale: false }
    }

    // Sentiment unzuverlässig: Live-Daten ohne Cache zurückgeben
    return { ...payload, cachedAt: null, stale: false }
  } catch (err) {
    // 3) Bei Fehler: Stale-Cache zurückgeben, falls vorhanden
    if (cached) {
      return {
        mentions: cached.mentions ?? [],
        total: cached.total_found,
        truncated: cached.truncated,
        sentimentScore: cached.sentiment_score,
        distribution: {
          positive: cached.positive_count,
          neutral: cached.neutral_count,
          negative: cached.negative_count,
        },
        cachedAt: cached.cached_at,
        sentimentReliable: true,
        stale: true,
      }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Sentiment-Alert: erzeugt Notification pro Tenant-Admin,
// wenn Score unter dem konfigurierten Schwellwert liegt.
// Fehler werden geschluckt (kein Crash des Haupt-Requests).
// ---------------------------------------------------------------------------

export async function maybeTriggerSentimentAlert(
  admin: SupabaseClient,
  params: {
    tenantId: string
    customerId: string
    keyword: string
    period: MentionPeriod
    sentimentScore: number | null
    threshold: number | null
  }
): Promise<void> {
  const { tenantId, customerId, keyword, period, sentimentScore, threshold } =
    params

  if (
    threshold === null ||
    sentimentScore === null ||
    sentimentScore >= threshold
  ) {
    return
  }

  try {
    // BUG-1 Fix: Dedup nicht via LIKE auf body (Substring-Matches bei ähnlichen Keywords).
    // Stattdessen exakte Übereinstimmung auf customer_id + keyword + period via link-Feld.
    // Das link-Feld enthält den vollständig qualifizierten Pfad, der alle drei enthält.
    const since = new Date(Date.now() - CACHE_TTL_MS).toISOString()
    const alertLink = `/tools/brand-trends?customer=${customerId}&keyword=${encodeURIComponent(keyword)}&period=${period}`
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('type', 'sentiment_alert')
      .eq('link', alertLink)
      .gte('created_at', since)
      .limit(1)

    if (existing && existing.length > 0) return

    // Empfänger: aktive Tenant-Admins
    const { data: admins } = await admin
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('role', 'admin')
      .limit(50)

    if (!admins || admins.length === 0) return

    // Customer-Name für lesbaren Body (best-effort)
    const { data: customer } = await admin
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .maybeSingle()

    const customerName = customer?.name ?? 'Kunde'
    const title = 'Sentiment-Alert: Score unter Schwellwert'
    const body = `${customerName} – "${keyword}" (${period}): Sentiment-Score ${sentimentScore} liegt unter dem Schwellwert ${threshold}.`
    // BUG-1: Link enthält customer+keyword+period für exakte Dedup-Erkennung
    const link = `/tools/brand-trends?customer=${customerId}&keyword=${encodeURIComponent(keyword)}&period=${period}`

    const rows = admins.map((row) => ({
      tenant_id: tenantId,
      user_id: row.user_id,
      type: 'sentiment_alert' as const,
      title,
      body,
      link,
    }))

    await admin.from('notifications').insert(rows)
  } catch (err) {
    console.error(
      '[brand-mentions] sentiment alert failed',
      err instanceof Error ? err.message : err
    )
  }
}
