import { createAdminClient } from '@/lib/supabase-admin'
import { getGA4DashboardSnapshot, getGA4Integration, parseGA4Credentials } from '@/lib/ga4-api'
import {
  getCustomerGscDashboardSnapshot,
  getCustomerGscIntegration,
  parseCustomerGscCredentials,
} from '@/lib/gsc-customer-api'
import {
  getGoogleAdsDashboardSnapshot,
  getGoogleAdsIntegration,
  parseGoogleAdsCredentials,
} from '@/lib/google-ads-api'
import {
  getMetaAdsDashboardSnapshot,
  getMetaAdsIntegration,
  parseMetaAdsCredentials,
} from '@/lib/meta-ads-api'
import {
  getTikTokAdsDashboardSnapshot,
  getTikTokAdsIntegration,
  parseTikTokAdsCredentials,
} from '@/lib/tiktok-ads-api'
import {
  generateCustomerReportPdf,
  generateGscDiscoveryXlsx,
  generateKeywordRankingsPdf,
  generateKeywordRankingsXlsx,
  generateMarketingDashboardPdf,
  type BrandingConfig,
  type CustomerSummaryData,
  type KeywordRankingRow,
  type MarketingDashboardExportData,
  type PerformanceRow,
  type TimeSeriesPoint,
} from '@/lib/export-generators'

export type ExportType =
  | 'keyword_rankings'
  | 'marketing_dashboard'
  | 'gsc_discovery'
  | 'customer_report'

export type ExportFormat = 'pdf' | 'png' | 'xlsx'
export type BrandingSource = 'tenant' | 'customer'

type AdminClient = ReturnType<typeof createAdminClient>

export interface GenerateExportOptions {
  admin: AdminClient
  tenantId: string
  type: ExportType
  format: Extract<ExportFormat, 'pdf' | 'xlsx'>
  customerId: string | null
  brandingSource: BrandingSource
  brandColor: string
  acknowledgeEmpty: boolean
}

export interface CreatePngExportOptions {
  admin: AdminClient
  tenantId: string
  createdByUserId: string
  customerId: string | null
  brandingSource: BrandingSource
  brandColor: string
  acknowledgeEmpty: boolean
}

export interface GeneratedExportFile {
  fileBuffer: Buffer
  fileName: string
  customerName: string | null
}

export interface ExportAvailabilityResult {
  hasData: boolean
  message: string | null
}

export interface PngSnapshotPayload {
  title: string
  subtitle: string
  metrics: Array<{ label: string; value: string | number; unit?: string }>
  generatedAt: string
  accentColor: string
}

export const TYPE_FORMAT_ALLOWED: Record<ExportType, ExportFormat[]> = {
  keyword_rankings: ['pdf', 'xlsx'],
  marketing_dashboard: ['pdf', 'png'],
  gsc_discovery: ['xlsx'],
  customer_report: ['pdf'],
}

export const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export const TYPE_LABELS: Record<ExportType, string> = {
  keyword_rankings: 'Keyword Rankings',
  marketing_dashboard: 'Marketing Dashboard',
  gsc_discovery: 'GSC Discovery',
  customer_report: 'Kundenbericht',
}

const EXT_BY_FORMAT: Record<ExportFormat, string> = {
  pdf: 'pdf',
  png: 'png',
  xlsx: 'xlsx',
}

interface BrandingResolution {
  branding: BrandingConfig
  customerName: string | null
  tenantSlug: string
}

interface ExportRecordRow {
  id: string
  tenant_id: string
  export_type: ExportType
  format: ExportFormat
  customer_id: string | null
  branding_source: BrandingSource
  brand_color: string
  status: 'pending' | 'generating' | 'done' | 'failed'
  storage_path: string | null
  file_name: string | null
}

interface MarketingDashboardSummary {
  pageviews: number
  users: number
  ga4Conversions: number
  bounceRate: number
  avgSessionDuration: number
  gscImpressions: number
  gscClicks: number
  gscCtr: number
  gscAvgPosition: number
  activeCampaigns: number
  totalSpend: number
  adsConversions: number
  avgCpc: number
  avgCpm: number
  tikTokVideoViews: number
  ga4Timeseries: TimeSeriesPoint[]
  gscTimeseries: TimeSeriesPoint[]
  totalSpendTimeseries: TimeSeriesPoint[]
}

type ExportHttpError = Error & { status?: number; userMessage?: string }

export function buildFileName(type: string, format: ExportFormat, context: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const slug = context
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return `${type}_${slug}_${date}.${EXT_BY_FORMAT[format]}`
}

export async function generateExportFile({
  admin,
  tenantId,
  type,
  format,
  customerId,
  brandingSource,
  brandColor,
  acknowledgeEmpty,
}: GenerateExportOptions): Promise<GeneratedExportFile> {
  const { branding, customerName, tenantSlug } = await resolveBrandingContext(
    admin,
    tenantId,
    customerId,
    brandingSource,
    brandColor
  )

  let fileBuffer: Buffer
  let fileName: string

  if (type === 'keyword_rankings') {
    const result = await fetchKeywordRankingsData(admin, tenantId, customerId)
    assertHasData(result.length === 0, acknowledgeEmpty, 'Für diese Auswahl liegen aktuell keine Keyword-Ranking-Daten vor.')

    fileBuffer =
      format === 'xlsx'
        ? generateKeywordRankingsXlsx(result, branding)
        : await generateKeywordRankingsPdf(result, branding)
    fileName = buildFileName('keyword-rankings', format, customerName ?? tenantSlug)
  } else if (type === 'gsc_discovery') {
    const result = await fetchKeywordRankingsData(admin, tenantId, customerId)
    assertHasData(result.length === 0, acknowledgeEmpty, 'Für diese Auswahl liegen aktuell keine GSC-Daten vor.')

    fileBuffer = generateGscDiscoveryXlsx(result, branding)
    fileName = buildFileName('gsc-discovery', format, customerName ?? tenantSlug)
  } else if (type === 'marketing_dashboard') {
    const result = await fetchMarketingDashboardExportData(admin, tenantId, customerId)
    assertHasData(
      result.rows.length === 0,
      acknowledgeEmpty,
      'Für diese Auswahl liegen aktuell keine Performance-Daten vor.'
    )

    fileBuffer = await generateMarketingDashboardPdf(result, branding)
    fileName = buildFileName('marketing-dashboard', format, customerName ?? tenantSlug)
  } else {
    if (!customerId || !customerName) {
      throwHttpError(400, 'Für den Kundenbericht muss ein Kunde ausgewählt sein.')
    }

    const result = await fetchCustomerSummaryData(admin, tenantId, customerId)
    assertHasData(result.keywordCount === 0, acknowledgeEmpty, 'Für diesen Kunden liegen noch keine Daten vor.')

    fileBuffer = await generateCustomerReportPdf(result, branding)
    fileName = buildFileName('kundenbericht', format, customerName)
  }

  return { fileBuffer, fileName, customerName }
}

export async function createPendingMarketingDashboardPngExport({
  admin,
  tenantId,
  createdByUserId,
  customerId,
  brandingSource,
  brandColor,
  acknowledgeEmpty,
}: CreatePngExportOptions) {
  const { branding, customerName, tenantSlug } = await resolveBrandingContext(
    admin,
    tenantId,
    customerId,
    brandingSource,
    brandColor
  )

  const metrics = await fetchPerformanceData(admin, tenantId, customerId)
  assertHasData(metrics.length === 0, acknowledgeEmpty, 'Für diese Auswahl liegen aktuell keine Performance-Daten vor.')

  const fileName = buildFileName('marketing-dashboard', 'png', customerName ?? tenantSlug)

  const { data: exportRecord, error } = await admin
    .from('exports')
    .insert({
      tenant_id: tenantId,
      created_by_user_id: createdByUserId,
      export_type: 'marketing_dashboard',
      format: 'png',
      customer_id: customerId,
      branding_source: brandingSource,
      brand_color: brandColor,
      status: 'pending',
      file_name: fileName,
    })
    .select(
      'id, export_type, format, customer_id, branding_source, brand_color, status, error_message, created_at, email_sent_at, email_sent_to'
    )
    .single()

  if (error || !exportRecord) {
    throwHttpError(500, 'PNG-Export konnte nicht vorbereitet werden.')
  }

  return {
    export: {
      ...exportRecord,
      type: exportRecord.export_type,
      customer_name: customerName,
    },
    snapshot: buildMarketingDashboardSnapshot(metrics, branding),
  }
}

export async function checkExportDataAvailability({
  admin,
  tenantId,
  type,
  customerId,
}: {
  admin: AdminClient
  tenantId: string
  type: ExportType
  customerId: string | null
}): Promise<ExportAvailabilityResult> {
  if (type === 'keyword_rankings') {
    const result = await fetchKeywordRankingsData(admin, tenantId, customerId)
    return {
      hasData: result.length > 0,
      message:
        result.length > 0
          ? null
          : 'Für diese Auswahl liegen aktuell keine Keyword-Ranking-Daten vor.',
    }
  }

  if (type === 'gsc_discovery') {
    const result = await fetchKeywordRankingsData(admin, tenantId, customerId)
    return {
      hasData: result.length > 0,
      message: result.length > 0 ? null : 'Für diese Auswahl liegen aktuell keine GSC-Daten vor.',
    }
  }

  if (type === 'marketing_dashboard') {
    const result = await fetchPerformanceData(admin, tenantId, customerId)
    return {
      hasData: result.length > 0,
      message:
        result.length > 0
          ? null
          : 'Für diese Auswahl liegen aktuell keine Performance-Daten vor.',
    }
  }

  if (!customerId) {
    return {
      hasData: false,
      message: 'Für den Kundenbericht muss ein Kunde ausgewählt sein.',
    }
  }

  const result = await fetchCustomerSummaryData(admin, tenantId, customerId)
  return {
    hasData: result.keywordCount > 0,
    message: result.keywordCount > 0 ? null : 'Für diesen Kunden liegen noch keine Daten vor.',
  }
}

export async function regenerateExportFile(admin: AdminClient, exportRecord: ExportRecordRow) {
  if (exportRecord.format === 'png') {
    return null
  }

  const generated = await generateExportFile({
    admin,
    tenantId: exportRecord.tenant_id,
    type: exportRecord.export_type,
    format: exportRecord.format,
    customerId: exportRecord.customer_id,
    brandingSource: exportRecord.branding_source,
    brandColor: exportRecord.brand_color,
    acknowledgeEmpty: true,
  })

  const storagePath = `${exportRecord.tenant_id}/${Date.now()}-${generated.fileName}`
  const { error: uploadError } = await admin.storage.from('exports').upload(storagePath, generated.fileBuffer, {
    contentType: MIME_BY_FORMAT[exportRecord.format],
    upsert: false,
  })

  if (uploadError) {
    throw new Error('Regenerierte Export-Datei konnte nicht gespeichert werden.')
  }

  const { data: updated, error: updateError } = await admin
    .from('exports')
    .update({
      storage_path: storagePath,
      file_name: generated.fileName,
      status: 'done',
      error_message: null,
    })
    .eq('id', exportRecord.id)
    .select('id, tenant_id, status, storage_path, file_name, format')
    .single()

  if (updateError || !updated) {
    throw new Error('Export-Eintrag konnte nach der Regeneration nicht aktualisiert werden.')
  }

  return updated
}

function buildMarketingDashboardSnapshot(
  metrics: PerformanceRow[],
  branding: BrandingConfig
): PngSnapshotPayload {
  return {
    title: 'Marketing Dashboard',
    subtitle: branding.customerName
      ? `${branding.tenantName} · ${branding.customerName}`
      : `${branding.tenantName} · Alle Kunden`,
    metrics: metrics.slice(0, 8),
    generatedAt: new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    accentColor: branding.accentColor,
  }
}

async function resolveBrandingContext(
  admin: AdminClient,
  tenantId: string,
  customerId: string | null,
  brandingSource: BrandingSource,
  brandColor: string
): Promise<BrandingResolution> {
  let customerName: string | null = null
  let customerLogoUrl: string | null = null

  if (customerId) {
    const { data: customer } = await admin
      .from('customers')
      .select('name, logo_url')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!customer) {
      throwHttpError(404, 'Kunde nicht gefunden.')
    }

    customerName = customer.name
    customerLogoUrl = (customer as { logo_url?: string | null }).logo_url ?? null
  }

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, logo_url, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) {
    throwHttpError(404, 'Tenant nicht gefunden.')
  }

  return {
    customerName,
    tenantSlug: tenant.slug,
    branding: {
      logoUrl:
        brandingSource === 'customer' && customerLogoUrl
          ? customerLogoUrl
          : (tenant as { logo_url?: string | null }).logo_url ?? null,
      accentColor: brandColor,
      tenantName: tenant.name,
      customerName,
    },
  }
}

function assertHasData(isEmpty: boolean, acknowledgeEmpty: boolean, message: string) {
  if (isEmpty && !acknowledgeEmpty) {
    throwHttpError(409, message)
  }
}

function throwHttpError(status: number, message: string): never {
  const error: ExportHttpError = new Error(message)
  error.status = status
  error.userMessage = message
  throw error
}

async function fetchKeywordRankingsData(
  admin: AdminClient,
  tenantId: string,
  customerId: string | null
): Promise<KeywordRankingRow[]> {
  let query = admin
    .from('keyword_ranking_snapshots')
    .select('keyword_label, position, best_url, clicks, impressions, tracked_at')
    .eq('tenant_id', tenantId)
    .order('tracked_at', { ascending: false })
    .limit(2000)

  if (customerId) {
    const { data: projectIds } = await admin
      .from('keyword_projects')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)

    const ids = (projectIds ?? []).map((project: { id: string }) => project.id)
    if (ids.length === 0) return []
    query = query.in('project_id', ids)
  }

  const { data, error } = await query

  if (error) {
    console.error('[fetchKeywordRankingsData] DB-Fehler:', error)
    return []
  }

  return (data ?? []).map((row) => ({
    keyword: row.keyword_label,
    position: row.position,
    url: row.best_url,
    clicks: row.clicks,
    impressions: row.impressions,
    trackedAt: row.tracked_at,
  }))
}

async function fetchPerformanceData(
  admin: AdminClient,
  tenantId: string,
  customerId: string | null
): Promise<PerformanceRow[]> {
  const exportData = await fetchMarketingDashboardExportData(admin, tenantId, customerId)
  return exportData.rows
}

async function fetchMarketingDashboardExportData(
  admin: AdminClient,
  tenantId: string,
  customerId: string | null
): Promise<MarketingDashboardExportData> {
  let query = admin
    .from('performance_analyses')
    .select('metrics, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  const { data, error } = await query
  if (!error && data && data.length > 0) {
    for (const row of data) {
      const metrics = row.metrics as Record<string, unknown> | null
      if (!metrics || typeof metrics !== 'object') continue

      const mapped = mapPerformanceMetrics(metrics)
      if (mapped.length > 0) {
        return {
          rows: mapped,
          charts: [],
        }
      }
    }
  }

  if (!customerId) {
    return fetchTenantMarketingDashboardData(admin, tenantId)
  }

  return fetchLiveMarketingDashboardData(tenantId, customerId)
}

function mapPerformanceMetrics(metrics: Record<string, unknown>): PerformanceRow[] {
  return Object.entries(metrics)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value: typeof value === 'number' ? value.toLocaleString('de-DE') : String(value),
    }))
    .slice(0, 50)
}

async function fetchLiveMarketingDashboardData(
  tenantId: string,
  customerId: string
): Promise<MarketingDashboardExportData> {
  const summary = await fetchLiveMarketingDashboardSummary(tenantId, customerId)
  return mapMarketingDashboardSummaryToExportData(summary)
}

async function fetchTenantMarketingDashboardData(
  admin: AdminClient,
  tenantId: string
): Promise<MarketingDashboardExportData> {
  const { data: customers, error } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(200)

  if (error || !customers || customers.length === 0) {
    return { rows: [], charts: [] }
  }

  const summaries = await Promise.all(
    customers.map(async (customer) =>
      fetchLiveMarketingDashboardSummary(tenantId, customer.id).catch(() => null)
    )
  )

  const availableSummaries = summaries.filter(
    (summary): summary is MarketingDashboardSummary => summary !== null
  )

  const aggregate = availableSummaries.reduce<MarketingDashboardSummary | null>((acc, current) => {
    if (!acc) return current

    return {
      pageviews: acc.pageviews + current.pageviews,
      users: acc.users + current.users,
      ga4Conversions: acc.ga4Conversions + current.ga4Conversions,
      bounceRate: Math.max(acc.bounceRate, current.bounceRate),
      avgSessionDuration: Math.max(acc.avgSessionDuration, current.avgSessionDuration),
      gscImpressions: acc.gscImpressions + current.gscImpressions,
      gscClicks: acc.gscClicks + current.gscClicks,
      gscCtr: Math.max(acc.gscCtr, current.gscCtr),
      gscAvgPosition: Math.max(acc.gscAvgPosition, current.gscAvgPosition),
      activeCampaigns: acc.activeCampaigns + current.activeCampaigns,
      totalSpend: acc.totalSpend + current.totalSpend,
      adsConversions: acc.adsConversions + current.adsConversions,
      avgCpc: Math.max(acc.avgCpc, current.avgCpc),
      avgCpm: Math.max(acc.avgCpm, current.avgCpm),
      tikTokVideoViews: acc.tikTokVideoViews + current.tikTokVideoViews,
      ga4Timeseries: mergeTimeseries(acc.ga4Timeseries, current.ga4Timeseries),
      gscTimeseries: mergeTimeseries(acc.gscTimeseries, current.gscTimeseries),
      totalSpendTimeseries: mergeTimeseries(
        acc.totalSpendTimeseries,
        current.totalSpendTimeseries
      ),
    }
  }, null)

  if (!aggregate) {
    return { rows: [], charts: [] }
  }

  return mapMarketingDashboardSummaryToExportData(aggregate)
}

async function fetchLiveMarketingDashboardSummary(
  tenantId: string,
  customerId: string
): Promise<MarketingDashboardSummary> {
  const [
    ga4Integration,
    gscIntegration,
    googleAdsIntegration,
    metaAdsIntegration,
    tiktokAdsIntegration,
  ] = await Promise.all([
    getGA4Integration(tenantId, customerId).catch(() => null),
    getCustomerGscIntegration(tenantId, customerId).catch(() => null),
    getGoogleAdsIntegration(tenantId, customerId).catch(() => null),
    getMetaAdsIntegration(tenantId, customerId).catch(() => null),
    getTikTokAdsIntegration(tenantId, customerId).catch(() => null),
  ])

  const [
    ga4Result,
    gscResult,
    googleAdsResult,
    metaAdsResult,
    tiktokResult,
  ] = await Promise.all([
    loadGa4ExportMetrics(ga4Integration),
    loadGscExportMetrics(gscIntegration),
    loadGoogleAdsExportMetrics(googleAdsIntegration),
    loadMetaAdsExportMetrics(metaAdsIntegration),
    loadTikTokExportMetrics(tiktokAdsIntegration),
  ])

  const activeCampaigns =
    (googleAdsResult.data?.campaigns.filter((campaign) => campaign.status === 'ENABLED').length ?? 0) +
    (metaAdsResult.data?.campaigns.length ?? 0) +
    (tiktokResult.data?.activeCampaigns ?? tiktokResult.data?.campaigns.length ?? 0)

  return {
    pageviews: ga4Result.data?.pageviews ?? 0,
    users: ga4Result.data?.users ?? 0,
    ga4Conversions: ga4Result.data?.conversions ?? 0,
    bounceRate: ga4Result.data?.bounceRate ?? 0,
    avgSessionDuration: ga4Result.data?.avgSessionDuration ?? 0,
    gscImpressions: gscResult.data?.impressions ?? 0,
    gscClicks: gscResult.data?.clicks ?? 0,
    gscCtr: gscResult.data?.avgCtr ?? 0,
    gscAvgPosition: gscResult.data?.avgPosition ?? 0,
    activeCampaigns,
    totalSpend:
      (googleAdsResult.data?.totalCost ?? 0) +
      (metaAdsResult.data?.totalCost ?? 0) +
      (tiktokResult.data?.totalCost ?? 0),
    adsConversions:
      (googleAdsResult.data?.totalConversions ?? 0) + (metaAdsResult.data?.totalConversions ?? 0),
    avgCpc: googleAdsResult.data?.avgCpc ?? 0,
    avgCpm: metaAdsResult.data?.avgCpm ?? 0,
    tikTokVideoViews: tiktokResult.data?.totalVideoViews ?? 0,
    ga4Timeseries: normalizeTimeseries(ga4Result.data?.timeseries),
    gscTimeseries: normalizeTimeseries(gscResult.data?.timeseries),
    totalSpendTimeseries: mergeTimeseries(
      normalizeTimeseries(googleAdsResult.data?.timeseries),
      normalizeTimeseries(metaAdsResult.data?.timeseries),
      normalizeTimeseries(tiktokResult.data?.timeseries)
    ),
  }
}

function mapMarketingDashboardSummaryToExportData(
  summary: MarketingDashboardSummary
): MarketingDashboardExportData {
  const rows: PerformanceRow[] = [
    { label: 'Seitenaufrufe', value: formatMetricNumber(summary.pageviews) },
    { label: 'Nutzer', value: formatMetricNumber(summary.users) },
    { label: 'GA4 Conversions', value: formatMetricNumber(summary.ga4Conversions) },
    { label: 'Absprungrate', value: formatMetricNumber(summary.bounceRate), unit: '%' },
    {
      label: 'Durchschnittliche Sitzungsdauer',
      value: formatMetricNumber(summary.avgSessionDuration),
      unit: 'Sek.'
    },
    { label: 'GSC Impressionen', value: formatMetricNumber(summary.gscImpressions) },
    { label: 'GSC Klicks', value: formatMetricNumber(summary.gscClicks) },
    { label: 'GSC CTR', value: formatMetricNumber(summary.gscCtr), unit: '%' },
    { label: 'GSC Durchschnittsposition', value: formatMetricNumber(summary.gscAvgPosition) },
    { label: 'Aktive Kampagnen', value: formatMetricNumber(summary.activeCampaigns) },
    {
      label: 'Gesamtausgaben',
      value: formatMetricNumber(summary.totalSpend),
      unit: 'EUR',
    },
    {
      label: 'Ads Conversions',
      value: formatMetricNumber(summary.adsConversions),
    },
    { label: 'Durchschnittlicher CPC', value: formatMetricNumber(summary.avgCpc), unit: 'EUR' },
    { label: 'Durchschnittlicher CPM', value: formatMetricNumber(summary.avgCpm), unit: 'EUR' },
    { label: 'TikTok Video Views', value: formatMetricNumber(summary.tikTokVideoViews) },
  ]

  return {
    rows: rows.filter((row) => row.value !== '0' && row.value !== '0,0' && row.value !== '0,00'),
    charts: [
      {
        title: 'Seitenaufrufe',
        series: summary.ga4Timeseries,
        strokeColor: '#f97316',
      },
      {
        title: 'Impressionen',
        series: summary.gscTimeseries,
        strokeColor: '#3b82f6',
      },
      {
        title: 'Gesamtausgaben',
        series: summary.totalSpendTimeseries,
        strokeColor: '#ef4444',
      },
    ].filter((chart) => chart.series.length > 1),
  }
}

function formatMetricNumber(value: number): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })
}

async function loadGa4ExportMetrics(integration: Awaited<ReturnType<typeof getGA4Integration>>) {
  if (!integration || integration.status === 'disconnected') return { data: null }
  const credentials = parseGA4Credentials(integration.credentials_encrypted)
  if (!credentials || integration.status === 'token_expired') return { data: null }
  try {
    const data = await getGA4DashboardSnapshot(integration, credentials, '30d')
    return { data }
  } catch {
    return { data: null }
  }
}

async function loadGscExportMetrics(
  integration: Awaited<ReturnType<typeof getCustomerGscIntegration>>
) {
  if (!integration || integration.status === 'disconnected') return { data: null }
  const credentials = parseCustomerGscCredentials(integration.credentials_encrypted)
  if (!credentials || integration.status === 'token_expired') return { data: null }
  try {
    const result = await getCustomerGscDashboardSnapshot(integration, credentials, '30d')
    return { data: result.data }
  } catch {
    return { data: null }
  }
}

async function loadGoogleAdsExportMetrics(
  integration: Awaited<ReturnType<typeof getGoogleAdsIntegration>>
) {
  if (!integration || integration.status === 'disconnected') return { data: null }
  const credentials = parseGoogleAdsCredentials(integration.credentials_encrypted)
  if (!credentials || integration.status === 'token_expired') return { data: null }
  try {
    const result = await getGoogleAdsDashboardSnapshot(integration, credentials, '30d')
    return { data: result.data }
  } catch {
    return { data: null }
  }
}

async function loadMetaAdsExportMetrics(
  integration: Awaited<ReturnType<typeof getMetaAdsIntegration>>
) {
  if (!integration || integration.status === 'disconnected') return { data: null }
  const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
  if (!credentials || integration.status === 'token_expired') return { data: null }
  try {
    const result = await getMetaAdsDashboardSnapshot(integration, credentials, '30d')
    return { data: result.data }
  } catch {
    return { data: null }
  }
}

async function loadTikTokExportMetrics(
  integration: Awaited<ReturnType<typeof getTikTokAdsIntegration>>
) {
  if (!integration || integration.status === 'disconnected') return { data: null }
  const credentials = parseTikTokAdsCredentials(integration.credentials_encrypted)
  if (!credentials || integration.status === 'token_expired') return { data: null }
  try {
    const result = await getTikTokAdsDashboardSnapshot(integration, credentials, '30d')
    return { data: result.data }
  } catch {
    return { data: null }
  }
}

function normalizeTimeseries(
  series: Array<{ label: string; value: number }> | undefined
): TimeSeriesPoint[] {
  return (series ?? [])
    .filter(
      (point): point is { label: string; value: number } =>
        typeof point?.label === 'string' && typeof point?.value === 'number'
    )
    .map((point) => ({
      label: point.label,
      value: point.value,
    }))
}

function mergeTimeseries(
  ...seriesList: TimeSeriesPoint[][]
): TimeSeriesPoint[] {
  const totalsByLabel = new Map<string, number>()

  for (const series of seriesList) {
    for (const point of series) {
      totalsByLabel.set(point.label, (totalsByLabel.get(point.label) ?? 0) + point.value)
    }
  }

  return Array.from(totalsByLabel.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }))
}

async function fetchCustomerSummaryData(
  admin: AdminClient,
  tenantId: string,
  customerId: string
): Promise<CustomerSummaryData> {
  const { data: customer, error } = await admin
    .from('customers')
    .select('name, industry, domain')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[fetchCustomerSummaryData] DB-Fehler:', error)
  }

  const rankings = await fetchKeywordRankingsData(admin, tenantId, customerId)

  const avgPosition =
    rankings.length > 0
      ? rankings.reduce((sum, row) => sum + (row.position ?? 0), 0) / rankings.length
      : null

  const topKeywords = [...rankings]
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 20)

  return {
    customerName: customer?.name ?? 'Unbekannt',
    industry: (customer as { industry?: string | null } | null)?.industry ?? null,
    website: (customer as { domain?: string | null } | null)?.domain ?? null,
    keywordCount: rankings.length,
    avgPosition,
    topKeywords,
  }
}
