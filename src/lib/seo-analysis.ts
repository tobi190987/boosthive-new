export type SeoCrawlMode = 'single' | 'multiple' | 'full-domain'

export interface SeoLighthouseScores {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
}

export interface SeoTechnicalCheck {
  label: string
  ok: boolean
  value?: string
  description?: string
}

export interface SeoTechnicalResult {
  lighthouseScores: SeoLighthouseScores | null
  checks: SeoTechnicalCheck[]
  checkedUrl: string
}

export interface SeoPageResult {
  url: string
  title: string
  metaDescription: string
  h1s: string[]
  h2s: string[]
  images: { total: number; withoutAlt: number }
  wordCount: number
  internalLinks: number
  externalLinks: number
  hasCanonical: boolean
  hasOgTags: boolean
  hasSchemaOrg: boolean
  issues: string[]
  score: number
  error?: string
  warning?: string
}

export interface SeoAnalysisResult {
  overallScore: number
  totalPages: number
  pages: SeoPageResult[]
  aiInsights: string
  technicalSeo: SeoTechnicalResult | null
}

export interface SeoAnalysisSummary {
  id: string
  status: 'running' | 'done' | 'error'
  pagesCrawled: number
  pagesTotal: number
  overallScore: number | null
  totalPages: number | null
  createdAt: string
  completedAt: string | null
  config: {
    urls: string[]
    crawlMode: SeoCrawlMode
    maxPages: number
  }
}

export function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function stripHtml(text: string) {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(text: string) {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    laquo: '«',
    raquo: '»',
    copy: '©',
    reg: '®',
    trade: '™',
  }

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, value: string) => {
    const normalized = value.toLowerCase()

    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    return namedEntities[normalized] ?? entity
  })
}

function extractTitle(html: string) {
  return decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '')
}

function extractMetaDescription(html: string) {
  const firstMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  )
  const secondMatch = html.match(
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
  )

  return decodeHtmlEntities((firstMatch?.[1] ?? secondMatch?.[1] ?? '').trim())
}

function extractHeadings(html: string, level: 'h1' | 'h2') {
  return [...html.matchAll(new RegExp(`<${level}[^>]*>([\\s\\S]*?)<\\/${level}>`, 'gi'))]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean)
}

function extractImages(html: string) {
  const matches = [...html.matchAll(/<img[^>]*>/gi)]
  return {
    total: matches.length,
    withoutAlt: matches.filter((match) => !/alt=["'][^"']*["']/i.test(match[0])).length,
  }
}

function extractLinks(html: string, pageUrl: string) {
  const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((match) => match[1])

  try {
    const base = new URL(pageUrl)
    const internal = new Set<string>()
    const external = new Set<string>()

    for (const href of hrefs) {
      try {
        const url = new URL(href, base)
        if (!['http:', 'https:'].includes(url.protocol)) continue
        if (url.hostname === base.hostname) internal.add(url.href)
        else external.add(url.href)
      } catch {
        continue
      }
    }

    return {
      internal: [...internal],
      external: [...external],
    }
  } catch {
    return { internal: [], external: [] }
  }
}

function extractText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeInputUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function resolveOriginVariants(rawUrl: string) {
  const normalized = normalizeInputUrl(rawUrl)
  if (!normalized) return []

  const parsed = new URL(normalized)
  const hostname = parsed.hostname.toLowerCase()
  const hasWww = hostname.startsWith('www.')
  const withWww = hasWww ? hostname : `www.${hostname}`
  const withoutWww = hasWww ? hostname.slice(4) : hostname
  const variants: string[] = []

  for (const protocol of ['https:', 'http:']) {
    for (const host of [withWww, withoutWww]) {
      variants.push(`${protocol}//${host}`)
    }
  }

  return variants
}

/**
 * Validates that a URL points to a publicly routable address.
 * Blocks localhost, loopback, private ranges, and link-local (AWS metadata) addresses
 * to prevent SSRF attacks.
 */
export function assertPublicUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Ungültige URL.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Nur HTTP(S)-URLs sind erlaubt.')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '') // strip IPv6 brackets

  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    throw new Error('Interne Adressen sind nicht erlaubt.')
  }

  // Block IPv6 loopback and private ranges
  if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')) {
    throw new Error('Interne Adressen sind nicht erlaubt.')
  }

  // Block IPv4 private / reserved ranges
  const parts = hostname.split('.').map(Number)
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts
    if (
      a === 127 || // loopback
      a === 10 || // RFC1918 private
      a === 0 || // "this" network
      (a === 172 && b >= 16 && b <= 31) || // RFC1918 private
      (a === 192 && b === 168) || // RFC1918 private
      (a === 169 && b === 254) || // link-local (AWS metadata: 169.254.169.254)
      (a === 100 && b >= 64 && b <= 127) // shared address space RFC6598
    ) {
      throw new Error('Interne Adressen sind nicht erlaubt.')
    }
  }
}

export async function fetchPage(url: string): Promise<{ html: string; status?: number; warning?: string } | { error: string; status: number } | null> {
  assertPublicUrl(url)
  const baseHeaders = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Pragma': 'no-cache',
  }

  const attempts: RequestInit[] = [
    {
      headers: baseHeaders,
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    },
    {
      headers: {
        ...baseHeaders,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    },
  ]

  let lastStatus: number | undefined

  for (const init of attempts) {
    try {
      const response = await fetch(url, init)
      lastStatus = response.status

      if (response.ok) {
        const html = await response.text()
        // BUG-5: warn if page HTML is very large (> 2 MB)
        if (html.length > 2 * 1024 * 1024) {
          return { html, status: response.status, warning: 'Seite sehr groß — Ergebnisse möglicherweise unvollständig.' }
        }
        return { html, status: response.status }
      }

      // For some blocked pages, the body still contains parseable HTML
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        const html = await response.text()
        // Only use if it looks like real page content (not just an error page with minimal HTML)
        if (html.length > 1000 && /<body/i.test(html)) {
          return { html, status: response.status }
        }
      }
    } catch {
      continue
    }
  }

  if (lastStatus !== undefined) {
    return { error: httpStatusLabel(lastStatus), status: lastStatus }
  }

  return null
}

function httpStatusLabel(status: number): string {
  if (status === 403) return `Zugriff verweigert (403) – die Seite blockiert automatisierte Anfragen`
  if (status === 429) return `Zu viele Anfragen (429) – Rate Limit erreicht`
  if (status === 404) return `Seite nicht gefunden (404)`
  if (status === 500) return `Server-Fehler (500)`
  if (status === 503) return `Dienst nicht verfügbar (503)`
  if (status >= 400 && status < 500) return `HTTP ${status} – Seite nicht erreichbar`
  if (status >= 500) return `HTTP ${status} – Server-Fehler`
  return `HTTP ${status}`
}

export function buildPageAnalysis(url: string, html: string): SeoPageResult {
  const title = extractTitle(html)
  const metaDescription = extractMetaDescription(html)
  const h1s = extractHeadings(html, 'h1')
  const h2s = extractHeadings(html, 'h2')
  const images = extractImages(html)
  const links = extractLinks(html, url)
  const wordCount = extractText(html).split(/\s+/).filter(Boolean).length
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html)
  const hasOgTags = /<meta[^>]+property=["']og:/i.test(html)
  const hasSchemaOrg = /schema\.org|application\/ld\+json/i.test(html)

  const issues: string[] = []
  let score = 100

  if (!title) {
    issues.push('Kein <title>-Tag vorhanden')
    score -= 15
  } else if (title.length < 50) {
    issues.push(`Title zu kurz (${title.length} Zeichen, empfohlen: 50-60)`)
    score -= 5
  } else if (title.length > 60) {
    issues.push(`Title zu lang (${title.length} Zeichen, empfohlen: max. 60)`)
    score -= 3
  }

  if (!metaDescription) {
    issues.push('Keine Meta-Description vorhanden')
    score -= 10
  } else if (metaDescription.length < 120) {
    issues.push(`Meta-Description zu kurz (${metaDescription.length} Zeichen)`)
    score -= 3
  } else if (metaDescription.length > 160) {
    issues.push(`Meta-Description zu lang (${metaDescription.length} Zeichen, empfohlen: max. 160)`)
    score -= 3
  }

  if (h1s.length === 0) {
    issues.push('Kein H1-Tag vorhanden')
    score -= 10
  } else if (h1s.length > 1) {
    issues.push(`Mehrere H1-Tags gefunden (${h1s.length})`)
    score -= 5
  }

  if (images.withoutAlt > 0) {
    issues.push(`${formatCountLabel(images.withoutAlt, 'Bild', 'Bilder')} ohne Alt-Text`)
    score -= Math.min(10, images.withoutAlt * 2)
  }

  if (!hasCanonical) {
    issues.push('Kein Canonical-Tag vorhanden')
    score -= 5
  }

  if (!hasOgTags) {
    issues.push('Keine Open-Graph-Tags vorhanden')
    score -= 5
  }

  if (wordCount < 300) {
    issues.push(`Zu wenig Inhalt (${wordCount} Wörter, empfohlen: mindestens 300)`)
    score -= 10
  } else if (wordCount < 600) {
    issues.push(`Inhalt eher knapp (${wordCount} Wörter, empfohlen: 600+)`)
    score -= 3
  }

  return {
    url,
    title,
    metaDescription,
    h1s,
    h2s,
    images,
    wordCount,
    internalLinks: links.internal.length,
    externalLinks: links.external.length,
    hasCanonical,
    hasOgTags,
    hasSchemaOrg,
    issues,
    score: Math.max(0, score),
  }
}

export async function runTechnicalSeoCheck(url: string, html: string): Promise<SeoTechnicalResult> {
  const checks: SeoTechnicalCheck[] = [
    {
      label: 'HTTPS',
      ok: url.startsWith('https://'),
      description: 'Prüft, ob die Seite verschlüsselt per HTTPS ausgeliefert wird.',
    },
    {
      label: 'Viewport Meta',
      ok: /<meta[^>]+name=["']viewport["']/i.test(html),
      description: 'Wichtig für saubere Darstellung und korrekte Skalierung auf mobilen Geräten.',
    },
    {
      label: 'Charset definiert',
      ok: /<meta[^>]+charset/i.test(html),
      description: 'Legt die Zeichenkodierung fest, damit Umlaute und Sonderzeichen korrekt erscheinen.',
    },
    {
      label: 'Favicon vorhanden',
      ok: /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(html),
      description: 'Hilft bei Wiedererkennbarkeit in Browser-Tabs, Bookmarks und Suchergebnissen.',
    },
    {
      label: 'Strukturierte Daten',
      ok: /application\/ld\+json/i.test(html),
      description: 'Schema-Markup erleichtert Suchmaschinen das Verstehen der Seiteninhalte.',
    },
    {
      label: 'Hreflang Tags',
      ok: /hreflang=/i.test(html),
      description: 'Zeigt Suchmaschinen die passenden Sprach- oder Länderversionen einer Seite.',
    },
    {
      label: 'Robots Meta',
      ok: /<meta[^>]+name=["']robots["']/i.test(html),
      description: 'Steuert, ob und wie Suchmaschinen die Seite indexieren oder Links verfolgen sollen.',
    },
  ]

  let lighthouseScores: SeoLighthouseScores | null = null
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY

  if (apiKey) {
    try {
      const pageSpeedUrl =
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}` +
        `&key=${apiKey}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo`
      const response = await fetch(pageSpeedUrl, { signal: AbortSignal.timeout(30_000) })

      if (response.ok) {
        const data = await response.json()
        const categories = data.lighthouseResult?.categories

        if (categories) {
          lighthouseScores = {
            performance: categories.performance ? Math.round(categories.performance.score * 100) : null,
            accessibility: categories.accessibility
              ? Math.round(categories.accessibility.score * 100)
              : null,
            bestPractices: categories['best-practices']
              ? Math.round(categories['best-practices'].score * 100)
              : null,
            seo: categories.seo ? Math.round(categories.seo.score * 100) : null,
          }
        }
      }
    } catch {
      lighthouseScores = null
    }
  }

  return {
    lighthouseScores,
    checks,
    checkedUrl: url,
  }
}

export async function fetchSitemapUrls(sitemapUrl: string, depth = 0): Promise<string[]> {
  if (depth > 2) return []

  try {
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return []

    const xml = await response.text()

    if (/<sitemapindex/i.test(xml)) {
      const sitemapEntries = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) =>
        match[1].trim()
      )
      const nested = await Promise.all(
        sitemapEntries.slice(0, 10).map((entry) => fetchSitemapUrls(entry, depth + 1))
      )
      return nested.flat()
    }

    return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => match[1].trim())
  } catch {
    return []
  }
}

export async function collectUrls(
  startUrls: string[],
  crawlMode: SeoCrawlMode,
  maxPages: number
): Promise<string[]> {
  if (crawlMode === 'multiple') return startUrls.slice(0, maxPages)
  if (crawlMode === 'single') return startUrls.slice(0, 1)

  const origins = resolveOriginVariants(startUrls[0] ?? '')

  for (const origin of origins) {
    let urls = await fetchSitemapUrls(`${origin}/sitemap.xml`)

    if (!urls.length) {
      try {
        const robotsResponse = await fetch(`${origin}/robots.txt`, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(5_000),
        })

        if (robotsResponse.ok) {
          const robotsText = await robotsResponse.text()
          const sitemapUrls = [...robotsText.matchAll(/^Sitemap:\s*(.+)$/gim)].map((match) =>
            match[1].trim()
          )

          for (const sitemapUrl of sitemapUrls) {
            urls = await fetchSitemapUrls(sitemapUrl)
            if (urls.length) break
          }
        }
      } catch {
        continue
      }
    }

    if (urls.length) {
      return urls
    }
  }

  return startUrls.slice(0, 1)
}

export function buildInsights(pages: SeoPageResult[]) {
  const reachablePages = pages.filter((page) => !page.error)
  if (reachablePages.length === 0) {
    return '## Gesamtbewertung\nKeine erreichbaren Seiten konnten analysiert werden.\n\n## Handlungsempfehlungen\n- Prüfe, ob die eingegebene URL öffentlich erreichbar ist.\n- Stelle sicher, dass die Seite keine Login- oder Bot-Sperre hat.'
  }

  const count = (predicate: (page: SeoPageResult) => boolean) =>
    reachablePages.filter(predicate).length

  const missingTitles = count((page) => !page.title)
  const missingMeta = count((page) => !page.metaDescription)
  const badH1 = count((page) => page.h1s.length !== 1)
  const missingCanonical = count((page) => !page.hasCanonical)
  const imagesWithoutAlt = count((page) => page.images.withoutAlt > 0)
  const thinContent = count((page) => page.wordCount < 300)

  const actionItems = [
    missingTitles > 0
      ? `Title-Tags auf ${formatCountLabel(missingTitles, 'Seite', 'Seiten')} nachziehen oder optimieren.`
      : null,
    missingMeta > 0
      ? `Meta-Descriptions auf ${formatCountLabel(missingMeta, 'Seite', 'Seiten')} ergänzen und auf 120 bis 160 Zeichen bringen.`
      : null,
    badH1 > 0
      ? `Heading-Struktur bereinigen: ${formatCountLabel(badH1, 'Seite', 'Seiten')} haben keine oder mehrere H1-Tags.`
      : null,
    missingCanonical > 0
      ? `Canonical-Tags auf ${formatCountLabel(missingCanonical, 'Seite', 'Seiten')} ergänzen, um Duplicate-Content-Risiken zu senken.`
      : null,
    imagesWithoutAlt > 0
      ? `Alt-Texte für Bilder auf ${formatCountLabel(imagesWithoutAlt, 'Seite', 'Seiten')} vervollständigen.`
      : null,
    thinContent > 0
      ? `Inhaltstiefe auf ${formatCountLabel(thinContent, 'Seite', 'Seiten')} ausbauen, damit Suchmaschinen mehr semantischen Kontext erhalten.`
      : null,
  ].filter(Boolean) as string[]

  const criticalProblems = [
    missingTitles > 0 ? `${formatCountLabel(missingTitles, 'Seite', 'Seiten')} ohne Title-Tag` : null,
    missingMeta > 0 ? `${formatCountLabel(missingMeta, 'Seite', 'Seiten')} ohne Meta-Description` : null,
    badH1 > 0 ? `${formatCountLabel(badH1, 'Seite', 'Seiten')} mit fehlerhafter H1-Struktur` : null,
    missingCanonical > 0
      ? `${formatCountLabel(missingCanonical, 'Seite', 'Seiten')} ohne Canonical-Tag`
      : null,
    imagesWithoutAlt > 0
      ? `${formatCountLabel(imagesWithoutAlt, 'Seite', 'Seiten')} mit fehlenden Alt-Texten`
      : null,
    thinContent > 0 ? `${formatCountLabel(thinContent, 'Seite', 'Seiten')} mit zu wenig Content` : null,
  ].filter(Boolean) as string[]

  return [
    '## Gesamtbewertung',
    `${formatCountLabel(reachablePages.length, 'erreichbare Seite', 'erreichbare Seiten')} wurden analysiert. Der Fokus liegt auf technischen Grundlagen, Inhaltsdichte und Snippet-Qualität.`,
    '',
    '## Kritische Probleme',
    ...(criticalProblems.length > 0 ? criticalProblems.map((item) => `- ${item}`) : ['- Keine kritischen Muster erkannt.']),
    '',
    '## Handlungsempfehlungen',
    ...(actionItems.length > 0 ? actionItems.map((item) => `- ${item}`) : ['- Aktuell vor allem Feinschliff und Priorisierung der Seiten mit mittlerem Score sinnvoll.']),
  ].join('\n')
}
