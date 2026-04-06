import { createAdminClient } from '@/lib/supabase-admin'
import type { PerformanceAnalysis } from '@/lib/performance/types'
import {
  buildSeoConfigSummary,
  readSeoConfigSummary,
  withSeoConfigSummary,
  type SeoAnalysisResult,
  type SeoAnalysisSummary,
} from '@/lib/seo-analysis'
import { getProjectReportSummaryMap } from '@/lib/visibility-report'

export interface ShellCustomer {
  id: string
  name: string
  domain: string | null
  status: 'active' | 'paused'
}

export interface ShellNotification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

export interface TenantShellSummary {
  customers: ShellCustomer[]
  notifications: ShellNotification[]
  openApprovalsCount: number
}

export interface DashboardModule {
  id: string
  code: string
  name: string
  description: string
  status: 'active' | 'canceling' | 'canceled' | 'not_subscribed'
  current_period_end: string | null
}

export interface DashboardActivityItem {
  id: string
  type: 'approval_event' | 'content_brief' | 'ad_generation'
  label: string
  subtitle: string | null
  link: string
  created_at: string
}

export interface TenantDashboardData {
  modules: DashboardModule[]
  stats: {
    pendingApprovals: number
    briefs: number
    customers: number
    ads: number
  }
  activities: DashboardActivityItem[]
}

export interface KeywordProjectListItem {
  id: string
  name: string
  target_domain: string
  language_code: string
  country_code: string
  status: 'active' | 'inactive'
  created_at: string
  keyword_count: number
  competitor_count: number
  last_tracking_run: string | null
}

export interface KeywordProjectDetailItem extends KeywordProjectListItem {
  tracking_interval?: 'daily' | 'weekly'
}

export interface KeywordProjectGscStatus {
  connection: {
    id: string
    google_email: string
    selected_property: string | null
    status: 'connected' | 'expired' | 'revoked'
    connected_at: string
    token_expires_at?: string
  } | null
}

export interface ContentBriefListItem {
  id: string
  keyword: string
  language: string
  tone: string
  word_count_target: number
  target_url: string | null
  status: 'pending' | 'generating' | 'done' | 'failed'
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface SeoAnalysisStatusPayload {
  id: string
  status: 'running' | 'done' | 'error'
  pagesCrawled: number
  pagesTotal: number
  result: SeoAnalysisResult | null
  errorMsg: string | null
  createdAt: string
  completedAt: string | null
  config: SeoAnalysisSummary['config']
}

interface SeoAnalysisRowLite {
  id: string
  status: SeoAnalysisSummary['status']
  pages_crawled: number
  pages_total: number
  created_at: string
  completed_at: string | null
  config: unknown
  result?: unknown
}

async function persistSeoAnalysisSummaryIfNeeded(
  tenantId: string,
  analysisId: string,
  config: unknown,
  summary: ReturnType<typeof buildSeoConfigSummary>
) {
  if (!summary) return

  const admin = createAdminClient()
  await admin
    .from('seo_analyses')
    .update({
      config: withSeoConfigSummary(config, summary),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', analysisId)
}

function mapSeoAnalysisSummaryRow(
  tenantId: string,
  analysis: SeoAnalysisRowLite
): SeoAnalysisSummary {
  const config = withSeoConfigSummary(analysis.config, readSeoConfigSummary(analysis.config))
  const derivedSummary = config.summary ?? buildSeoConfigSummary(
    (analysis.result as SeoAnalysisResult | null | undefined) ?? null,
    analysis.completed_at
  )

  if (!config.summary && derivedSummary && analysis.status === 'done') {
    void persistSeoAnalysisSummaryIfNeeded(tenantId, analysis.id, analysis.config, derivedSummary)
  }

  return {
    id: analysis.id,
    status: analysis.status,
    pagesCrawled: analysis.pages_crawled,
    pagesTotal: analysis.pages_total,
    overallScore: derivedSummary?.overallScore ?? null,
    totalPages: derivedSummary?.totalPages ?? null,
    createdAt: analysis.created_at,
    completedAt: analysis.completed_at,
    config: withSeoConfigSummary(analysis.config, derivedSummary),
  }
}

function asActiveModuleStatus(status: string | null | undefined) {
  if (status === 'active') return 'active'
  if (status === 'canceling') return 'canceling'
  if (status === 'canceled') return 'canceled'
  return 'not_subscribed'
}

export async function getTenantShellSummary(
  tenantId: string,
  userId: string
): Promise<TenantShellSummary> {
  const admin = createAdminClient()

  const [customersResult, notificationsResult, approvalsResult] = await Promise.all([
    admin
      .from('customers')
      .select('id, name, domain, status')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(500),
    admin
      .from('notifications')
      .select('id, type, title, body, link, read_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['pending_approval', 'changes_requested']),
  ])

  return {
    customers: (customersResult.data ?? []) as ShellCustomer[],
    notifications: (notificationsResult.data ?? []) as ShellNotification[],
    openApprovalsCount: approvalsResult.count ?? 0,
  }
}

export async function getKeywordProjectsList(
  tenantId: string,
  customerId?: string | null
): Promise<KeywordProjectListItem[]> {
  const admin = createAdminClient()

  let query = admin
    .from('keyword_projects')
    .select(`
      id,
      name,
      target_domain,
      language_code,
      country_code,
      status,
      last_tracking_run,
      created_at,
      keywords(count),
      competitor_domains(count)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    target_domain: project.target_domain,
    language_code: project.language_code,
    country_code: project.country_code,
    status: project.status,
    last_tracking_run: project.last_tracking_run,
    created_at: project.created_at,
    keyword_count: (project.keywords as { count: number }[] | null)?.[0]?.count ?? 0,
    competitor_count: (project.competitor_domains as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
}

export async function getKeywordProjectDetail(
  tenantId: string,
  projectId: string
): Promise<KeywordProjectDetailItem | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('keyword_projects')
    .select(`
      id,
      name,
      target_domain,
      language_code,
      country_code,
      tracking_interval,
      status,
      last_tracking_run,
      created_at,
      keywords(count),
      competitor_domains(count)
    `)
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    target_domain: data.target_domain,
    language_code: data.language_code,
    country_code: data.country_code,
    tracking_interval: data.tracking_interval,
    status: data.status,
    last_tracking_run: data.last_tracking_run,
    created_at: data.created_at,
    keyword_count: (data.keywords as { count: number }[] | null)?.[0]?.count ?? 0,
    competitor_count: (data.competitor_domains as { count: number }[] | null)?.[0]?.count ?? 0,
  }
}

export async function getKeywordProjectGscStatus(
  tenantId: string,
  projectId: string
): Promise<KeywordProjectGscStatus> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('gsc_connections')
    .select('id, google_email, selected_property, status, connected_at, token_expires_at')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return { connection: null }

  return {
    connection: {
      id: data.id,
      google_email: data.google_email,
      selected_property: data.selected_property,
      status: data.status,
      connected_at: data.connected_at,
      token_expires_at: data.token_expires_at,
    },
  }
}

export async function getSeoAnalysisSummaries(
  tenantId: string,
  customerId?: string | null
): Promise<SeoAnalysisSummary[]> {
  const admin = createAdminClient()
  let query = admin
    .from('seo_analyses')
    .select('id, status, pages_crawled, pages_total, created_at, completed_at, config')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as SeoAnalysisRowLite[]
  const missingSummaryIds = rows
    .filter((analysis) => analysis.status === 'done' && !readSeoConfigSummary(analysis.config))
    .map((analysis) => analysis.id)

  const resultMap = new Map<string, unknown>()
  if (missingSummaryIds.length > 0) {
    const admin = createAdminClient()
    const { data: analysesWithResult } = await admin
      .from('seo_analyses')
      .select('id, result')
      .eq('tenant_id', tenantId)
      .in('id', missingSummaryIds)

    for (const item of analysesWithResult ?? []) {
      resultMap.set(item.id, item.result)
    }
  }

  return rows.map((analysis) =>
    mapSeoAnalysisSummaryRow(tenantId, {
      ...analysis,
      result: analysis.result ?? resultMap.get(analysis.id),
    })
  )
}

export async function getSeoAnalysisStatus(
  tenantId: string,
  analysisId: string
): Promise<SeoAnalysisStatusPayload | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('seo_analyses')
    .select('id, status, pages_crawled, pages_total, result, error_msg, created_at, completed_at, config')
    .eq('tenant_id', tenantId)
    .eq('id', analysisId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const existingSummary = readSeoConfigSummary(data.config)
  const derivedSummary =
    existingSummary ??
    buildSeoConfigSummary((data.result as SeoAnalysisResult | null) ?? null, data.completed_at)

  if (!existingSummary && derivedSummary && data.status === 'done') {
    void persistSeoAnalysisSummaryIfNeeded(tenantId, analysisId, data.config, derivedSummary)
  }

  return {
    id: data.id,
    status: data.status,
    pagesCrawled: data.pages_crawled,
    pagesTotal: data.pages_total,
    result: (data.result as SeoAnalysisResult | null) ?? null,
    errorMsg: data.error_msg,
    createdAt: data.created_at,
    completedAt: data.completed_at,
    config: withSeoConfigSummary(data.config, derivedSummary),
  }
}

export async function getVisibilityProjectsList(
  tenantId: string,
  customerId?: string | null
) {
  const admin = createAdminClient()

  let projectQuery = admin
    .from('visibility_projects')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (customerId) {
    projectQuery = projectQuery.eq('customer_id', customerId)
  }

  const { data: projects, error } = await projectQuery
  if (error) throw new Error(error.message)
  if (!projects || projects.length === 0) return []

  const projectIds = projects.map((project) => project.id)
  const summaries = await getProjectReportSummaryMap(tenantId, projectIds)

  return projects.map((project) => ({
    ...project,
    latest_analysis_status: summaries[project.id]?.latestAnalysisStatus ?? null,
    latest_analysis_at: summaries[project.id]?.latestAnalysisAt ?? null,
    latest_analytics_status: summaries[project.id]?.latestAnalyticsStatus ?? null,
    latest_share_of_model: summaries[project.id]?.latestShareOfModel ?? null,
    trend_delta: summaries[project.id]?.trendDelta ?? null,
    analysis_count: summaries[project.id]?.analysisCount ?? 0,
  }))
}

export async function getContentBriefsList(
  tenantId: string,
  customerId?: string | null
): Promise<ContentBriefListItem[]> {
  const admin = createAdminClient()

  let query = admin
    .from('content_briefs')
    .select('id, keyword, language, tone, word_count_target, target_url, status, error_message, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []) as ContentBriefListItem[]
}

export async function getPerformanceHistoryList(
  tenantId: string,
  customerId?: string | null
): Promise<PerformanceAnalysis[]> {
  const admin = createAdminClient()

  let query = admin
    .from('performance_analyses')
    .select('id, type, client_label, platform, analysis, meta, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []) as PerformanceAnalysis[]
}

export async function getTenantDashboardData(
  tenantId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<TenantDashboardData> {
  const admin = createAdminClient()
  const isAdmin = role === 'admin'

  const [modulesResult, bookingsResult, approvalsCountResult, briefsCountResult, customersCountResult, adsCountResult] =
    await Promise.all([
      admin
        .from('modules')
        .select('id, code, name, description, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      admin
        .from('tenant_modules')
        .select('module_id, status, current_period_end')
        .eq('tenant_id', tenantId),
      admin
        .from('approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['pending_approval', 'changes_requested']),
      admin
        .from('content_briefs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      admin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      admin
        .from('ad_generations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
    ])

  const bookingMap = new Map(
    (bookingsResult.data ?? []).map((booking) => [booking.module_id, booking])
  )

  const modules = (modulesResult.data ?? []).map((module) => {
    const booking = bookingMap.get(module.id)
    return {
      id: module.id,
      code: module.code,
      name: module.name,
      description: module.description,
      status: asActiveModuleStatus(booking?.status),
      current_period_end: booking?.current_period_end ?? null,
    }
  }) as DashboardModule[]

  let eventsQuery = admin
    .from('approval_request_events')
    .select(
      'id, event_type, actor_label, created_at, approval_request_id, approval_requests!inner(customer_name, content_title, created_by)'
    )
    .eq('approval_requests.tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(10)

  let briefsQuery = admin
    .from('content_briefs')
    .select('id, keyword, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5)

  let adsQuery = admin
    .from('ad_generations')
    .select('id, briefing, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (!isAdmin) {
    eventsQuery = eventsQuery.eq('approval_requests.created_by', userId)
    briefsQuery = briefsQuery.eq('created_by', userId)
    adsQuery = adsQuery.eq('created_by', userId)
  }

  const [eventsResult, briefsResult, adsResult] = await Promise.allSettled([
    eventsQuery,
    briefsQuery,
    adsQuery,
  ])

  const activities: DashboardActivityItem[] = []

  if (eventsResult.status === 'fulfilled' && !eventsResult.value.error) {
    for (const event of eventsResult.value.data ?? []) {
      const approvalRequestValue = event.approval_requests as unknown
      const approvalRequest = (
        Array.isArray(approvalRequestValue)
          ? approvalRequestValue[0]
          : approvalRequestValue
      ) as {
        customer_name: string | null
        content_title: string | null
      } | null

      if (!approvalRequest) continue

      const eventLabels: Record<string, string> = {
        submitted: 'Freigabe eingereicht',
        resubmitted: 'Erneut eingereicht',
        approved: 'Freigabe erteilt',
        changes_requested: 'Korrektur angefragt',
        content_updated: 'Inhalt aktualisiert',
      }

      activities.push({
        id: `event-${event.id}`,
        type: 'approval_event',
        label: eventLabels[event.event_type as string] ?? event.event_type,
        subtitle:
          [approvalRequest.content_title, approvalRequest.customer_name].filter(Boolean).join(' - ') || null,
        link: '/tools/approvals',
        created_at: event.created_at,
      })
    }
  }

  if (briefsResult.status === 'fulfilled' && !briefsResult.value.error) {
    for (const brief of briefsResult.value.data ?? []) {
      activities.push({
        id: `brief-${brief.id}`,
        type: 'content_brief',
        label: 'Content Brief erstellt',
        subtitle: brief.keyword ?? null,
        link: `/tools/content-briefs?briefId=${brief.id}`,
        created_at: brief.created_at,
      })
    }
  }

  if (adsResult.status === 'fulfilled' && !adsResult.value.error) {
    for (const ad of adsResult.value.data ?? []) {
      const briefing = ad.briefing as Record<string, unknown> | null
      const product = typeof briefing?.product === 'string' ? briefing.product : 'Unbenannt'
      activities.push({
        id: `ad-${ad.id}`,
        type: 'ad_generation',
        label: 'Ad-Text generiert',
        subtitle: product,
        link: '/tools/ad-generator',
        created_at: ad.created_at,
      })
    }
  }

  activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return {
    modules,
    stats: {
      pendingApprovals: approvalsCountResult.count ?? 0,
      briefs: briefsCountResult.count ?? 0,
      customers: customersCountResult.count ?? 0,
      ads: adsCountResult.count ?? 0,
    },
    activities: activities.slice(0, 10),
  }
}
