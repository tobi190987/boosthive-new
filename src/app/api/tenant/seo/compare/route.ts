import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import {
  assertPublicUrl,
  buildPageAnalysis,
  collectUrls,
  fetchPage,
  normalizeInputUrl,
  type SeoPageResult,
} from '@/lib/seo-analysis'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, SEO_COMPARE_START } from '@/lib/rate-limit'

export const maxDuration = 300

const compareSchema = z.object({
  ownUrl: z.string().min(1).max(2048),
  competitorUrls: z.array(z.string().min(1).max(2048)).min(1).max(3),
  crawlMode: z.enum(['single', 'full-domain']).optional().default('single'),
  maxPages: z.number().int().min(1).max(20).optional().default(10),
  customerId: z.string().uuid().nullable().optional(),
})

async function validateCustomerId(
  tenantId: string,
  customerId: string | null | undefined,
  admin: ReturnType<typeof createAdminClient>
) {
  if (!customerId) return null

  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return customer
}

// ---------------------------------------------------------------------------
// Single page fetch + analyse
// ---------------------------------------------------------------------------

async function analyzeSingleUrl(url: string): Promise<SeoPageResult> {
  const pageResponse = await fetchPage(url)

  if (!pageResponse) {
    return {
      url,
      title: '',
      metaDescription: '',
      h1s: [],
      h2s: [],
      images: { total: 0, withoutAlt: 0 },
      wordCount: 0,
      internalLinks: 0,
      externalLinks: 0,
      hasCanonical: false,
      hasOgTags: false,
      hasSchemaOrg: false,
      issues: ['Seite nicht erreichbar (Verbindung fehlgeschlagen)'],
      score: 0,
      error: 'Seite nicht erreichbar (Verbindung fehlgeschlagen)',
    }
  }

  if ('error' in pageResponse) {
    return {
      url,
      title: '',
      metaDescription: '',
      h1s: [],
      h2s: [],
      images: { total: 0, withoutAlt: 0 },
      wordCount: 0,
      internalLinks: 0,
      externalLinks: 0,
      hasCanonical: false,
      hasOgTags: false,
      hasSchemaOrg: false,
      issues: [pageResponse.error],
      score: 0,
      error: pageResponse.error,
    }
  }

  const result = buildPageAnalysis(url, pageResponse.html)
  if (pageResponse.warning) {
    result.warning = pageResponse.warning
  }
  return result
}

// ---------------------------------------------------------------------------
// Domain crawl: collect pages + aggregate into one SeoPageResult
// ---------------------------------------------------------------------------

function aggregatePageResults(rootUrl: string, pages: SeoPageResult[]): SeoPageResult {
  const reachable = pages.filter((p) => !p.error)

  if (reachable.length === 0) {
    return {
      url: rootUrl,
      title: '',
      metaDescription: '',
      h1s: [],
      h2s: [],
      images: { total: 0, withoutAlt: 0 },
      wordCount: 0,
      internalLinks: 0,
      externalLinks: 0,
      hasCanonical: false,
      hasOgTags: false,
      hasSchemaOrg: false,
      issues: ['Alle Seiten nicht erreichbar'],
      score: 0,
      error: 'Alle Seiten nicht erreichbar',
      pagesAnalyzed: 0,
    }
  }

  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
  const majority = (arr: boolean[]) => arr.filter(Boolean).length / arr.length >= 0.5

  // Use the homepage (first reachable) for single-value fields
  const homepage = reachable[0]

  return {
    url: rootUrl,
    title: homepage.title,
    metaDescription: homepage.metaDescription,
    h1s: homepage.h1s,
    h2s: homepage.h2s,
    score: avg(reachable.map((p) => p.score)),
    wordCount: avg(reachable.map((p) => p.wordCount)),
    images: {
      total: reachable.reduce((s, p) => s + p.images.total, 0),
      withoutAlt: reachable.reduce((s, p) => s + p.images.withoutAlt, 0),
    },
    internalLinks: avg(reachable.map((p) => p.internalLinks)),
    externalLinks: avg(reachable.map((p) => p.externalLinks)),
    hasCanonical: majority(reachable.map((p) => p.hasCanonical)),
    hasOgTags: majority(reachable.map((p) => p.hasOgTags)),
    hasSchemaOrg: majority(reachable.map((p) => p.hasSchemaOrg)),
    issues: [],
    pagesAnalyzed: reachable.length,
  }
}

async function analyzeUrlOrDomain(
  url: string,
  crawlMode: 'single' | 'full-domain',
  maxPages: number
): Promise<SeoPageResult> {
  if (crawlMode === 'single') {
    return analyzeSingleUrl(url)
  }

  // Collect all URLs from sitemap (max maxPages)
  let urlsToAnalyze: string[]
  try {
    urlsToAnalyze = await collectUrls([url], 'full-domain', maxPages)
  } catch {
    urlsToAnalyze = [url]
  }

  if (urlsToAnalyze.length === 0) urlsToAnalyze = [url]

  // Validate all collected URLs (SSRF protection)
  const safeUrls = urlsToAnalyze.filter((u) => {
    try { assertPublicUrl(u); return true } catch { return false }
  })

  if (safeUrls.length === 0) return analyzeSingleUrl(url)

  // Analyse in small batches to reduce bot-protection triggers on stricter hosts.
  const results: SeoPageResult[] = []
  for (let i = 0; i < safeUrls.length; i += 2) {
    const batch = safeUrls.slice(i, i + 2)
    const batchResults = await Promise.all(batch.map(analyzeSingleUrl))
    results.push(...batchResults)

    if (i + 2 < safeUrls.length) {
      await new Promise((resolve) => setTimeout(resolve, 900))
    }
  }

  return aggregatePageResults(url, results)
}

// ---------------------------------------------------------------------------
// POST — run comparison
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  // Rate limiting: 5 compare starts per 15 min per tenant+IP
  const ip = getClientIp(request)
  const rlResult = checkRateLimit(`seo-compare:${tenantId}:${ip}`, SEO_COMPARE_START)
  if (!rlResult.allowed) return rateLimitResponse(rlResult)

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Eingabedaten.' }, { status: 400 })
  }

  const parsed = compareSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Eingabedaten.', details: parsed.error.flatten() }, { status: 400 })
  }

  const ownUrl = normalizeInputUrl(parsed.data.ownUrl)
  const rawCompetitors = parsed.data.competitorUrls.map((u) => normalizeInputUrl(u)).filter(Boolean)
  const crawlMode = parsed.data.crawlMode
  const maxPages = Math.min(parsed.data.maxPages, 20)
  const customerId = parsed.data.customerId ?? null

  if (!ownUrl) {
    return NextResponse.json({ error: 'Bitte gib deine eigene URL an.' }, { status: 400 })
  }

  if (rawCompetitors.length === 0) {
    return NextResponse.json({ error: 'Bitte gib mindestens eine Wettbewerber-URL an.' }, { status: 400 })
  }

  // Validate all URLs are public (SSRF protection)
  const allNormalized = [ownUrl, ...rawCompetitors]
  for (const url of allNormalized) {
    try {
      assertPublicUrl(url)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Ungültige URL.' }, { status: 400 })
    }
  }

  const uniqueUrls = new Set(allNormalized)
  if (uniqueUrls.size !== allNormalized.length) {
    return NextResponse.json({ error: 'Duplikat-URL erkannt. Bitte unterschiedliche URLs verwenden.' }, { status: 400 })
  }

  const pageResults = await Promise.all(
    allNormalized.map((url) => analyzeUrlOrDomain(url, crawlMode, maxPages))
  )

  const allErrors = pageResults.every((p) => p.error)
  if (allErrors) {
    return NextResponse.json({ error: 'Keine der URLs konnte erreicht werden. Analyse wird nicht gespeichert.' }, { status: 422 })
  }

  const admin = createAdminClient()
  if (customerId) {
    const customer = await validateCustomerId(tenantId, customerId, admin)
    if (!customer) {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
  }

  const { data: saved, error: dbError } = await admin
    .from('seo_comparisons')
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      created_by: authResult.auth.userId,
      own_url: ownUrl,
      competitor_urls: rawCompetitors,
      results: pageResults,
    })
    .select('id, created_at')
    .single()

  if (dbError || !saved) {
    return NextResponse.json({ error: dbError?.message ?? 'Vergleich konnte nicht gespeichert werden.' }, { status: 500 })
  }

  return NextResponse.json({
    id: saved.id,
    createdAt: saved.created_at,
    ownUrl,
    competitorUrls: rawCompetitors,
    crawlMode,
    results: pageResults,
  })
}

// ---------------------------------------------------------------------------
// GET — list comparisons
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  const customerId = request.nextUrl.searchParams.get('customer_id')

  const admin = createAdminClient()
  let query = admin
    .from('seo_comparisons')
    .select('id, own_url, competitor_urls, created_at, customer_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    (data ?? []).map((row) => ({
      id: row.id,
      ownUrl: row.own_url,
      competitorUrls: row.competitor_urls,
      createdAt: row.created_at,
      customerId: row.customer_id,
    }))
  )
}
