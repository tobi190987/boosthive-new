import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { getActiveModuleCodes } from '@/lib/module-access'
import { applyServerTimingHeaders, createServerTimer } from '@/lib/observability'
import { createAdminClient } from '@/lib/supabase-admin'

interface SearchResult {
  id: string
  label: string
  href: string
  group: string
  keywords?: string[]
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase()
}

function matchesQuery(query: string, ...parts: Array<string | null | undefined>) {
  const normalized = normalizeQuery(query)
  if (!normalized) return false
  return parts.some((part) => part?.toLowerCase().includes(normalized))
}

function limitMatches<T>(items: T[], count = 4) {
  return items.slice(0, count)
}

export async function GET(request: NextRequest) {
  const timer = createServerTimer('tenant.search', {
    path: request.nextUrl.pathname,
  })
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return applyServerTimingHeaders(
      NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 }),
      timer.finish({ failed: true, reason: 'missing_tenant_context' })
    )
  }

  const finishAuth = timer.mark('auth')
  const authResult = await requireTenantUser(tenantId)
  finishAuth()
  if ('error' in authResult) {
    return applyServerTimingHeaders(
      authResult.error,
      timer.finish({ tenantId, failed: true, reason: 'auth' })
    )
  }

  const query = request.nextUrl.searchParams.get('q') ?? ''
  if (query.trim().length < 2) {
    return applyServerTimingHeaders(
      NextResponse.json({ results: [] }),
      timer.finish({ tenantId, skipped: true, reason: 'query_too_short' })
    )
  }

  const admin = createAdminClient()
  const finishModules = timer.mark('modules')
  const moduleCodes = await getActiveModuleCodes(tenantId)
  finishModules()
  const hasModule = (code: string) => moduleCodes.includes(code) || moduleCodes.includes('all')

  const results: SearchResult[] = []

  const tasks: PromiseLike<void>[] = []

  tasks.push(
    admin
      .from('customers')
      .select('id, name, domain')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        limitMatches(
          (data ?? []).filter((customer) => matchesQuery(query, customer.name, customer.domain))
        ).forEach((customer) => {
          results.push({
            id: `customer-${customer.id}`,
            label: customer.name,
            href: '/tools/customers',
            group: 'Kunden',
            keywords: [customer.domain ?? ''],
          })
        })
      })
  )

  tasks.push(
    admin
      .from('approval_requests')
      .select('id, content_title, customer_name')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        limitMatches(
          (data ?? []).filter((approval) =>
            matchesQuery(query, approval.content_title, approval.customer_name)
          )
        ).forEach((approval) => {
          results.push({
            id: `approval-${approval.id}`,
            label: approval.content_title ?? 'Freigabe',
            href: '/tools/approvals',
            group: 'Freigaben',
            keywords: [approval.customer_name ?? ''],
          })
        })
      })
  )

  if (hasModule('content_briefs')) {
    tasks.push(
      admin
        .from('content_briefs')
        .select('id, keyword, target_url')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          limitMatches(
            (data ?? []).filter((brief) => matchesQuery(query, brief.keyword, brief.target_url))
          ).forEach((brief) => {
            results.push({
              id: `brief-${brief.id}`,
              label: brief.keyword,
              href: `/tools/content-briefs?briefId=${brief.id}`,
              group: 'Content Briefs',
              keywords: [brief.target_url ?? ''],
            })
          })
        })
    )
  }

  if (hasModule('seo_analyse')) {
    tasks.push(
      admin
        .from('keyword_projects')
        .select('id, name, target_domain')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          limitMatches(
            (data ?? []).filter((project) => matchesQuery(query, project.name, project.target_domain))
          ).forEach((project) => {
            results.push({
              id: `keyword-project-${project.id}`,
              label: project.name,
              href: `/tools/keywords?project=${project.id}`,
              group: 'Keyword Rankings',
              keywords: [project.target_domain ?? ''],
            })
          })
        })
    )

    tasks.push(
      admin
        .from('seo_analyses')
        .select('id, config')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          limitMatches(
            (data ?? []).filter((analysis) => {
              const urls =
                typeof analysis.config === 'object' && analysis.config && 'urls' in analysis.config
                  ? ((analysis.config as { urls?: string[] }).urls ?? [])
                  : []
              return matchesQuery(query, ...urls)
            })
          ).forEach((analysis) => {
            const urls =
              typeof analysis.config === 'object' && analysis.config && 'urls' in analysis.config
                ? ((analysis.config as { urls?: string[] }).urls ?? [])
                : []
            results.push({
              id: `seo-analysis-${analysis.id}`,
              label: urls[0] ?? 'SEO Analyse',
              href: `/tools/seo-analyse/${analysis.id}`,
              group: 'SEO Analysen',
              keywords: urls,
            })
          })
        })
    )
  }

  if (hasModule('ai_performance')) {
    tasks.push(
      admin
        .from('performance_analyses')
        .select('id, client_label, platform')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          limitMatches(
            (data ?? []).filter((analysis) =>
              matchesQuery(query, analysis.client_label, analysis.platform)
            )
          ).forEach((analysis) => {
            results.push({
              id: `performance-${analysis.id}`,
              label: analysis.client_label || analysis.platform || 'AI Performance Analyse',
              href: '/tools/ai-performance',
              group: 'AI Performance',
              keywords: [analysis.platform ?? ''],
            })
          })
        })
    )
  }

  if (hasModule('ai_visibility')) {
    tasks.push(
      admin
        .from('visibility_projects')
        .select('id, brand_name, website_url, keywords')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          limitMatches(
            (data ?? []).filter((project) =>
              matchesQuery(query, project.brand_name, project.website_url, ...(project.keywords ?? []))
            )
          ).forEach((project) => {
            results.push({
              id: `visibility-${project.id}`,
              label: project.brand_name,
              href: '/tools/ai-visibility',
              group: 'AI Visibility',
              keywords: [project.website_url ?? '', ...(project.keywords ?? [])],
            })
          })
        })
    )
  }

  if (hasModule('ad_generator')) {
    tasks.push(
      admin
        .from('ad_generations')
        .select('id, briefing')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          const generations = (data ?? []).map((generation) => {
            const briefing = generation.briefing as Record<string, unknown> | null
            return {
              id: generation.id,
              product: typeof briefing?.product === 'string' ? briefing.product : 'Ad Generator',
              customer_name:
                typeof briefing?.customer_name === 'string' ? briefing.customer_name : null,
            }
          })

          limitMatches(
            generations.filter((generation) =>
              matchesQuery(query, generation.product, generation.customer_name)
            )
          ).forEach((generation) => {
            results.push({
              id: `generation-${generation.id}`,
              label: generation.product,
              href: `/tools/ad-generator?id=${generation.id}`,
              group: 'Ad Generator',
              keywords: [generation.customer_name ?? ''],
            })
          })
        })
    )
  }

  const finishQueries = timer.mark('queries')
  await Promise.allSettled(tasks)
  finishQueries()

  return applyServerTimingHeaders(
    NextResponse.json({ results }),
    timer.finish({
      tenantId,
      query_length: query.length,
      result_count: results.length,
    })
  )
}
