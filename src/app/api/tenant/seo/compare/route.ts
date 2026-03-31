import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { buildPageAnalysis, fetchPage, normalizeInputUrl, assertPublicUrl, type SeoPageResult } from '@/lib/seo-analysis'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, SEO_COMPARE_START } from '@/lib/rate-limit'

export const maxDuration = 300

const compareSchema = z.object({
  ownUrl: z.string().min(1).max(2048),
  competitorUrls: z.array(z.string().min(1).max(2048)).min(1).max(3),
  customerId: z.string().uuid().nullable().optional(),
})

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

  const allUrls = allNormalized
  const uniqueUrls = new Set(allUrls)
  if (uniqueUrls.size !== allUrls.length) {
    return NextResponse.json({ error: 'Duplikat-URL erkannt. Bitte unterschiedliche URLs verwenden.' }, { status: 400 })
  }

  const pageResults = await Promise.all(allUrls.map(analyzeSingleUrl))

  const allErrors = pageResults.every((p) => p.error)
  if (allErrors) {
    return NextResponse.json({ error: 'Keine der URLs konnte erreicht werden. Analyse wird nicht gespeichert.' }, { status: 422 })
  }

  const admin = createAdminClient()
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
    results: pageResults,
  })
}

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
