import { createAdminClient } from '@/lib/supabase-admin'

interface PageSnapshot {
  url: string
  title: string
  metaDescription: string
  h1s: string[]
  h2s: string[]
  textSnippet: string
}

interface KeywordSuggestion {
  keyword: string
  reason: string
}

interface CompetitorSuggestion {
  domain: string
  reason: string
}

export interface KeywordProjectSuggestionsResult {
  source: 'anthropic' | 'fallback'
  page: PageSnapshot
  keywords: KeywordSuggestion[]
  competitors: CompetitorSuggestion[]
}

interface GenerateSuggestionsInput {
  targetDomain: string
  languageCode: string
  countryCode: string
  existingKeywords: string[]
  existingCompetitors: string[]
}

const FETCH_TIMEOUT_MS = 12_000
const STOPWORDS = new Set([
  'und',
  'oder',
  'der',
  'die',
  'das',
  'ein',
  'eine',
  'für',
  'fuer',
  'mit',
  'von',
  'bei',
  'auf',
  'aus',
  'zum',
  'zur',
  'dein',
  'deine',
  'deiner',
  'ihr',
  'ihre',
  'mehr',
  'jetzt',
  'alles',
  'über',
  'ueber',
  'specialist',
  'spezialist',
  'performance',
  'octanefactory',
  'www',
  'com',
  'de',
])

export async function generateKeywordProjectSuggestions(
  input: GenerateSuggestionsInput
): Promise<KeywordProjectSuggestionsResult> {
  const page = await fetchPageSnapshot(input.targetDomain)

  try {
    const aiResult = await generateWithClaude({
      page,
      languageCode: input.languageCode,
      countryCode: input.countryCode,
      existingKeywords: input.existingKeywords,
      existingCompetitors: input.existingCompetitors,
      targetDomain: input.targetDomain,
    })

    if (aiResult) {
      return aiResult
    }
  } catch (error) {
    console.error('[keyword-project-suggestions] Claude generation failed', error)
  }

  return buildFallbackSuggestions(input, page)
}

async function fetchPageSnapshot(targetDomain: string): Promise<PageSnapshot> {
  const candidates = [
    `https://${targetDomain}`,
    `https://www.${targetDomain}`,
    `http://${targetDomain}`,
    `http://www.${targetDomain}`,
  ]

  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const response = await fetch(candidate, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; BoostHiveKeywordSuggestions/1.0; +https://boost-hive.de)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        lastError = new Error(`Website konnte nicht geladen werden (${response.status}).`)
        continue
      }

      const html = await response.text()
      const cleaned = cleanHtml(html)
      return {
        url: response.url || candidate,
        title: extractTagContent(cleaned, 'title'),
        metaDescription: extractMetaDescription(cleaned),
        h1s: extractTagContents(cleaned, 'h1').slice(0, 5),
        h2s: extractTagContents(cleaned, 'h2').slice(0, 8),
        textSnippet: extractTextSnippet(cleaned),
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Die Ziel-Domain konnte nicht analysiert werden.')
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function extractTagContent(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return match ? stripTags(match[1]) : ''
}

function extractTagContents(html: string, tagName: string) {
  const matches = html.matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))
  return Array.from(matches)
    .map((match) => stripTags(match[1]))
    .filter(Boolean)
}

function extractMetaDescription(html: string) {
  const match =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)
  return match ? decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim() : ''
}

function extractTextSnippet(html: string) {
  return stripTags(html).slice(0, 4000)
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  throw new Error('Kein parsebares JSON in der KI-Antwort gefunden.')
}

async function generateWithClaude(input: {
  page: PageSnapshot
  languageCode: string
  countryCode: string
  existingKeywords: string[]
  existingCompetitors: string[]
  targetDomain: string
}): Promise<KeywordProjectSuggestionsResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
  if (!apiKey) return null

  const modelCandidates = [
    process.env.ANTHROPIC_SEO_MODEL,
    process.env.CLAUDE_MODEL,
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
  ].filter(Boolean) as string[]

  const prompt = [
    'Analysiere die folgende Website und leite daraus konkrete Vorschläge für SEO-Keywords und direkte Wettbewerber ab.',
    'Nutze nur Informationen, die aus Domain, Seitentitel, Meta-Description, Headlines und Textinhalt sinnvoll ableitbar sind.',
    'Erfinde keine Fantasie-Domains. Wenn du dir bei Wettbewerbern nicht sicher bist, liefere lieber weniger Vorschläge.',
    'Vermeide Dubletten zu bereits vorhandenen Keywords und Wettbewerbern.',
    'Antworte nur mit validem JSON.',
    `Ziel-Domain: ${input.targetDomain}`,
    `Finale URL: ${input.page.url}`,
    `Sprache: ${input.languageCode}`,
    `Land: ${input.countryCode}`,
    `Title: ${input.page.title || 'nicht vorhanden'}`,
    `Meta-Description: ${input.page.metaDescription || 'nicht vorhanden'}`,
    `H1: ${input.page.h1s.join(' | ') || 'nicht vorhanden'}`,
    `H2: ${input.page.h2s.join(' | ') || 'nicht vorhanden'}`,
    `Textauszug: ${input.page.textSnippet || 'nicht vorhanden'}`,
    `Bestehende Keywords: ${input.existingKeywords.join(' | ') || 'keine'}`,
    `Bestehende Wettbewerber: ${input.existingCompetitors.join(' | ') || 'keine'}`,
    '',
    'JSON-Schema:',
    '{',
    '  "keywords": [',
    '    { "keyword": "string", "reason": "kurze Begründung auf Deutsch" }',
    '  ],',
    '  "competitors": [',
    '    { "domain": "example.de", "reason": "kurze Begründung auf Deutsch" }',
    '  ]',
    '}',
    '',
    'Regeln:',
    '- Liefere 5 bis 8 Keyword-Vorschläge.',
    '- Keywords sollen suchnah, konkret und für die gegebene Domain relevant sein.',
    '- Liefere maximal 3 Wettbewerber-Domains.',
    '- Wettbewerber muessen als reine Domain ohne Protokoll zurueckkommen.',
  ].join('\n')

  const errors: string[] = []

  for (const model of modelCandidates) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        system:
          'Du bist ein praeziser deutscher SEO-Research-Assistent. Antworte ausschliesslich mit validem JSON ohne Markdown und ohne Zusatztext.',
        max_tokens: 900,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      errors.push(`${model}: ${errorBody || response.statusText}`)
      continue
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
    }

    const text = data.content?.find((item) => item.type === 'text' && item.text)?.text
    if (!text) {
      errors.push(`${model}: Leere KI-Antwort erhalten.`)
      continue
    }

    const parsed = JSON.parse(extractJsonObject(text)) as {
      keywords?: Array<{ keyword?: string; reason?: string }>
      competitors?: Array<{ domain?: string; reason?: string }>
    }

    return {
      source: 'anthropic',
      page: input.page,
      keywords: sanitizeKeywordSuggestions(parsed.keywords ?? [], input.existingKeywords),
      competitors: sanitizeCompetitorSuggestions(parsed.competitors ?? [], [
        ...input.existingCompetitors,
        input.targetDomain,
      ]),
    }
  }

  throw new Error(`Claude-Request fehlgeschlagen. Versuchte Modelle: ${errors.join(' || ')}`)
}

function buildFallbackSuggestions(
  input: GenerateSuggestionsInput,
  page: PageSnapshot
): KeywordProjectSuggestionsResult {
  const phrases = extractKeywordCandidates(page)
  const existingKeywords = new Set(input.existingKeywords.map((item) => item.toLowerCase()))

  const keywords = phrases
    .filter((keyword) => !existingKeywords.has(keyword.toLowerCase()))
    .slice(0, 8)
    .map((keyword) => ({
      keyword,
      reason: 'Aus Seitentitel, Headlines und Inhalt der Ziel-Domain abgeleitet.',
    }))

  return {
    source: 'fallback',
    page,
    keywords,
    competitors: [],
  }
}

function extractKeywordCandidates(page: PageSnapshot) {
  const primarySource = [page.title, page.metaDescription, ...page.h1s, ...page.h2s, page.textSnippet]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const tokens = primarySource
    .replace(/[^a-z0-9äöüß\s-]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))

  const uniqueTokens = Array.from(new Set(tokens))
  const candidates = new Set<string>()
  const joinedText = ` ${primarySource} `

  for (const token of uniqueTokens) {
    if (/(mini|bmw|tuning|performance|fahrwerk|auspuff|downpipe|ansaugung|kuehlung|kupplung|getriebe|leistungssteigerung|motorsport)/.test(token)) {
      candidates.add(token)
    }
  }

  const combos = [
    ['mini', 'tuning'],
    ['bmw', 'tuning'],
    ['mini', 'performance'],
    ['mini', 'fahrwerk'],
    ['mini', 'downpipe'],
    ['mini', 'auspuff'],
    ['mini', 'leistungssteigerung'],
    ['mini', 'motorsport'],
    ['bmw', 'performance'],
    ['bmw', 'fahrwerk'],
  ]

  for (const combo of combos) {
    if (combo.every((part) => joinedText.includes(` ${part} `))) {
      candidates.add(combo.join(' '))
    }
  }

  const modelMatches = Array.from(
    new Set(primarySource.match(/\b([frugj]\d{2}|m[234]\s?\([a-z0-9]+\)|f56|f55|f54|f60|r56|r60)\b/gi) ?? [])
  )

  for (const model of modelMatches.slice(0, 6)) {
    const normalizedModel = model.toLowerCase().replace(/\s+/g, ' ').trim()
    if (joinedText.includes(' mini ')) {
      candidates.add(`mini ${normalizedModel} tuning`)
    }
    if (joinedText.includes(' bmw ')) {
      candidates.add(`bmw ${normalizedModel} tuning`)
    }
  }

  return Array.from(candidates)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 4)
}

function sanitizeKeywordSuggestions(
  items: Array<{ keyword?: string; reason?: string }>,
  existingKeywords: string[]
) {
  const existing = new Set(existingKeywords.map((item) => item.toLowerCase()))
  const seen = new Set<string>()

  return items
    .map((item) => ({
      keyword: item.keyword?.trim() ?? '',
      reason: item.reason?.trim() ?? 'Passend zur Ziel-Domain.',
    }))
    .filter((item) => item.keyword.length >= 3)
    .filter((item) => !existing.has(item.keyword.toLowerCase()))
    .filter((item) => {
      const key = item.keyword.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

function sanitizeCompetitorSuggestions(
  items: Array<{ domain?: string; reason?: string }>,
  blockedDomains: string[]
) {
  const blocked = new Set(blockedDomains.map((item) => normalizeDomain(item)))
  const seen = new Set<string>()

  return items
    .map((item) => ({
      domain: normalizeDomain(item.domain ?? ''),
      reason: item.reason?.trim() ?? 'Ähnliche Zielgruppe oder ähnliches Produktangebot.',
    }))
    .filter((item) => DOMAIN_REGEX.test(item.domain))
    .filter((item) => !blocked.has(item.domain))
    .filter((item) => {
      if (seen.has(item.domain)) return false
      seen.add(item.domain)
      return true
    })
    .slice(0, 3)
}

function normalizeDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export async function loadProjectSuggestionContext(tenantId: string, projectId: string) {
  const admin = createAdminClient()
  const [projectResult, keywordsResult, competitorsResult] = await Promise.all([
    admin
      .from('keyword_projects')
      .select('id, target_domain, language_code, country_code')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single(),
    admin
      .from('keywords')
      .select('keyword')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),
    admin
      .from('competitor_domains')
      .select('domain')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId),
  ])

  if (projectResult.error || !projectResult.data) {
    throw new Error('Projekt nicht gefunden.')
  }
  if (keywordsResult.error) throw new Error(keywordsResult.error.message)
  if (competitorsResult.error) throw new Error(competitorsResult.error.message)

  return {
    project: projectResult.data,
    existingKeywords: (keywordsResult.data ?? []).map((item) => item.keyword),
    existingCompetitors: (competitorsResult.data ?? []).map((item) => item.domain),
  }
}
