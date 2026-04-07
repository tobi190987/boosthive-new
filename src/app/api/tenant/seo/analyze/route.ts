import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import {
  buildInsights,
  buildPageAnalysis,
  collectUrls,
  fetchPage,
  normalizeInputUrl,
  runTechnicalSeoCheck,
  type SeoPageResult,
} from '@/lib/seo-analysis'
import { createAdminClient } from '@/lib/supabase-admin'

export const maxDuration = 300

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

function buildAnalysisConfig(
  urls: string[],
  crawlMode: 'single' | 'multiple' | 'full-domain',
  maxPages: number,
  summary?: {
    overallScore: number
    totalPages: number
    completedAt: string
  }
) {
  return {
    urls,
    crawlMode,
    maxPages,
    summary: summary ?? null,
  }
}

async function analyzeInBatches(
  urls: string[],
  analysisId: string,
  admin: ReturnType<typeof createAdminClient>,
  batchSize = 2
) {
  const results: SeoPageResult[] = []
  let lastPersistedCount = 0

  for (let index = 0; index < urls.length; index += batchSize) {
    const batch = urls.slice(index, index + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (url) => {
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
          } satisfies SeoPageResult
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
          } satisfies SeoPageResult
        }

        return buildPageAnalysis(url, pageResponse.html)
      })
    )

    results.push(...batchResults)

    const shouldPersistProgress =
      results.length === urls.length || results.length - lastPersistedCount >= batchSize * 2

    if (shouldPersistProgress) {
      await admin
        .from('seo_analyses')
        .update({ pages_crawled: results.length })
        .eq('id', analysisId)
      lastPersistedCount = results.length
    }

    if (index + batchSize < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, 900))
    }
  }

  return results
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: {
    analysisId?: string
    urls?: string[]
    crawlMode?: 'single' | 'multiple' | 'full-domain'
    maxPages?: number
    customerId?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Eingabedaten.' }, { status: 400 })
  }

  const analysisId = body.analysisId?.trim()
  const customerId = typeof body.customerId === 'string' ? body.customerId : null
  const crawlMode = body.crawlMode ?? 'single'
  const maxPages = Math.min(Math.max(body.maxPages ?? 10, 1), 50)
  const rawUrls = (body.urls ?? []).map((url) => normalizeInputUrl(url)).filter(Boolean)

  if (!analysisId || rawUrls.length === 0) {
    return NextResponse.json({ error: 'Bitte gib mindestens eine gültige URL an.' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (customerId) {
    const customer = await validateCustomerId(tenantId, customerId, admin)
    if (!customer) {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
  }

  await admin.from('seo_analyses').insert({
    id: analysisId,
    tenant_id: tenantId,
    created_by: authResult.auth.userId,
    customer_id: customerId,
    status: 'running',
    config: buildAnalysisConfig(rawUrls, crawlMode, maxPages),
    pages_crawled: 0,
    pages_total: 0,
  })

  try {
    const urlsToAnalyze = await collectUrls(rawUrls, crawlMode, maxPages)

    await admin
      .from('seo_analyses')
      .update({
        pages_total: urlsToAnalyze.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysisId)

    const firstUrl = urlsToAnalyze[0]
    const [pages, firstHtml] = await Promise.all([
      analyzeInBatches(urlsToAnalyze, analysisId, admin, 2),
      firstUrl ? fetchPage(firstUrl).then((result) => (result && 'html' in result ? result.html : '')) : Promise.resolve(''),
    ])

    const technicalSeo = firstUrl ? await runTechnicalSeoCheck(firstUrl, firstHtml) : null
    const reachablePages = pages.filter((page) => !page.error)
    const overallScore = reachablePages.length
      ? Math.round(reachablePages.reduce((sum, page) => sum + page.score, 0) / reachablePages.length)
      : 0

    const result = {
      overallScore,
      totalPages: pages.length,
      pages,
      aiInsights: buildInsights(pages),
      technicalSeo,
    }
    const completedAt = new Date().toISOString()

    await admin
      .from('seo_analyses')
      .update({
        status: 'done',
        result,
        config: buildAnalysisConfig(rawUrls, crawlMode, maxPages, {
          overallScore,
          totalPages: pages.length,
          completedAt,
        }),
        pages_crawled: pages.length,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', analysisId)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analyse fehlgeschlagen'

    await admin
      .from('seo_analyses')
      .update({
        status: 'error',
        error_msg: message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysisId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
