import { decryptCredentials, encryptCredentials } from '@/lib/customer-credentials-encryption'
import {
  refreshTikTokAdsAccessToken,
  TikTokAdsTokenExpiredError,
} from '@/lib/tiktok-ads-oauth'
import { createAdminClient } from '@/lib/supabase-admin'

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3'
const CACHE_TTL_MS = 15 * 60 * 1000
const TOKEN_REFRESH_WINDOW_MS = 60 * 60 * 1000

export type TikTokAdsDateRangeKey = 'today' | '7d' | '30d' | '90d'

export interface TikTokAdvertiser {
  id: string
  name: string
  currency?: string
}

export interface TikTokCampaign {
  id: string
  name: string
  status?: string
  videoViews: number
  clicks: number
  cost: number
  cpc: number
}

export interface TikTokAdsDashboardData {
  campaigns: TikTokCampaign[]
  totalCost: number
  totalClicks: number
  totalVideoViews: number
  averageCpc: number
  activeCampaigns: number
  timeseries?: { label: string; value: number }[]
  currency?: string
  isCached?: boolean
  cacheAgeMinutes?: number
  message?: string
}

export interface TikTokAdsCredentials {
  access_token: string
  refresh_token: string
  token_expiry: string
  open_id?: string
  tiktok_display_name?: string
  selected_advertiser_id?: string
  selected_advertiser_name?: string
  currency?: string
  cached_snapshots?: Partial<Record<TikTokAdsDateRangeKey, TikTokAdsDashboardData>>
  cached_at_by_range?: Partial<Record<TikTokAdsDateRangeKey, string>>
}

export interface TikTokAdsIntegrationRecord {
  id: string
  customer_id: string
  integration_type: string
  status: string
  credentials_encrypted: string | null
}

interface TikTokApiEnvelope<T> {
  code?: number
  message?: string
  request_id?: string
  data?: T
}

interface TikTokListResponse<T> {
  list?: T[]
  data?: {
    list?: T[]
  }
}

interface TikTokAdvertiserEntry {
  advertiser_id?: string | number
  advertiser_name?: string
  name?: string
  currency?: string
}

interface TikTokCampaignEntry {
  campaign_id?: string | number
  campaign_name?: string
  status?: string
  secondary_status?: string
  operation_status?: string
}

interface TikTokReportRow {
  campaign_id?: string | number
  campaign_name?: string
  stat_cost?: string | number
  spend?: string | number
  cost?: string | number
  click_cnt?: string | number
  clicks?: string | number
  video_play_actions?: string | number
  video_views?: string | number
  metrics?: Record<string, string | number | undefined>
  dimensions?: Record<string, string | number | undefined>
}

const TIKTOK_REPORT_METRICS = ['spend', 'clicks', 'video_play_actions'] as const

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getDateRange(range: TikTokAdsDateRangeKey) {
  const now = new Date()
  const endDate = formatDate(now)

  let daysBack = 29
  if (range === 'today') daysBack = 0
  if (range === '7d') daysBack = 6
  if (range === '90d') daysBack = 89

  const startDateObj = new Date(now)
  startDateObj.setDate(startDateObj.getDate() - daysBack)
  const startDate = formatDate(startDateObj)

  const compareEndObj = new Date(startDateObj)
  compareEndObj.setDate(compareEndObj.getDate() - 1)

  const compareStartObj = new Date(compareEndObj)
  compareStartObj.setDate(compareStartObj.getDate() - daysBack)

  return {
    startDate,
    endDate,
    compareStartDate: formatDate(compareStartObj),
    compareEndDate: formatDate(compareEndObj),
  }
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeId(value: string | number | undefined): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

function normalizeStatus(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase()
  if (normalized.includes('enable') || normalized.includes('active') || normalized.includes('delivery')) {
    return 'ACTIVE'
  }
  if (normalized.includes('pause')) return 'PAUSED'
  return value
}

async function fetchTikTokJson<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text().catch(() => '')

  let payload: TikTokApiEnvelope<T> | null = null
  try {
    payload = text ? (JSON.parse(text) as TikTokApiEnvelope<T>) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message = payload?.message || text || `HTTP ${response.status}`
    if (response.status === 401 || response.status === 403) {
      throw new TikTokAdsTokenExpiredError(`TikTok API Zugriff fehlgeschlagen: ${message}`)
    }
    if (response.status === 429) {
      throw new TikTokAdsRateLimitError('TikTok API Rate Limit erreicht.')
    }
    throw new Error(`TikTok API Fehler: ${response.status} ${message}`)
  }

  if (payload?.code && payload.code !== 0) {
    const message = payload.message || 'unknown_error'
    if (message.toLowerCase().includes('access_token') || message.toLowerCase().includes('invalid_grant')) {
      throw new TikTokAdsTokenExpiredError(`TikTok API Zugriff fehlgeschlagen: ${message}`)
    }
    throw new Error(`TikTok API Fehler: ${message}`)
  }

  return (payload?.data ?? ({} as T)) as T
}

function extractTikTokList<T>(data: TikTokListResponse<T>, source: string): T[] {
  const list = Array.isArray(data.list) ? data.list : Array.isArray(data.data?.list) ? data.data.list : null
  if (list) return list
  throw new TikTokAdsContractError(`TikTok API Antwort fuer ${source} enthaelt keine erkennbare Liste.`)
}

export function parseTikTokAdsCredentials(encrypted: string | null): TikTokAdsCredentials | null {
  if (!encrypted) return null
  return decryptCredentials(encrypted) as TikTokAdsCredentials
}

export async function getTikTokAdsIntegration(
  _tenantId: string,
  customerId: string
): Promise<TikTokAdsIntegrationRecord | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customer_integrations')
    .select('id, customer_id, integration_type, status, credentials_encrypted')
    .eq('customer_id', customerId)
    .eq('integration_type', 'tiktok_ads')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as TikTokAdsIntegrationRecord | null) ?? null
}

export async function saveTikTokAdsIntegrationCredentials(options: {
  integrationId: string
  credentials: TikTokAdsCredentials
  status?: string
}) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('customer_integrations')
    .update({
      credentials_encrypted: encryptCredentials(options.credentials),
      status: options.status ?? 'connected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', options.integrationId)

  if (error) throw new Error(error.message)
}

export async function upsertTikTokAdsConnection(options: {
  customerId: string
  userId: string
  accessToken: string
  refreshToken: string
  tokenExpiry: string
  openId?: string
  displayName?: string
}) {
  const admin = createAdminClient()
  const existing = await getTikTokAdsIntegration('', options.customerId)
  const existingCredentials = parseTikTokAdsCredentials(existing?.credentials_encrypted ?? null)

  const nextCredentials: TikTokAdsCredentials = {
    access_token: options.accessToken,
    refresh_token: options.refreshToken,
    token_expiry: options.tokenExpiry,
    open_id: options.openId,
    tiktok_display_name: options.displayName ?? existingCredentials?.tiktok_display_name,
    selected_advertiser_id: existingCredentials?.selected_advertiser_id,
    selected_advertiser_name: existingCredentials?.selected_advertiser_name,
    currency: existingCredentials?.currency,
    cached_snapshots: existingCredentials?.cached_snapshots,
    cached_at_by_range: existingCredentials?.cached_at_by_range,
  }

  const { data, error } = await admin
    .from('customer_integrations')
    .upsert(
      {
        customer_id: options.customerId,
        integration_type: 'tiktok_ads',
        status: 'connected',
        credentials_encrypted: encryptCredentials(nextCredentials),
        connected_by: options.userId,
        connected_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'customer_id,integration_type', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data as { id: string }
}

export async function disconnectTikTokAdsIntegration(integrationId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('customer_integrations')
    .update({
      status: 'disconnected',
      credentials_encrypted: null,
      last_activity: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId)

  if (error) throw new Error(error.message)
}

export async function getValidTikTokAdsToken(
  integrationId: string,
  credentials: TikTokAdsCredentials
): Promise<{ accessToken: string; credentials: TikTokAdsCredentials }> {
  const expiryMs = new Date(credentials.token_expiry).getTime()

  if (expiryMs <= Date.now()) {
    const admin = createAdminClient()
    await admin
      .from('customer_integrations')
      .update({ status: 'token_expired', updated_at: new Date().toISOString() })
      .eq('id', integrationId)
    throw new TikTokAdsTokenExpiredError('TikTok-Token ist abgelaufen.')
  }

  if (expiryMs - Date.now() >= TOKEN_REFRESH_WINDOW_MS) {
    return { accessToken: credentials.access_token, credentials }
  }

  try {
    const refreshed = await refreshTikTokAdsAccessToken(credentials.refresh_token)
    const nextCredentials: TikTokAdsCredentials = {
      ...credentials,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || credentials.refresh_token,
      token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      open_id: refreshed.open_id ?? credentials.open_id,
    }

    await saveTikTokAdsIntegrationCredentials({
      integrationId,
      credentials: nextCredentials,
      status: 'connected',
    })

    return { accessToken: nextCredentials.access_token, credentials: nextCredentials }
  } catch (error) {
    const admin = createAdminClient()
    await admin
      .from('customer_integrations')
      .update({ status: 'token_expired', updated_at: new Date().toISOString() })
      .eq('id', integrationId)

    if (error instanceof TikTokAdsTokenExpiredError) {
      throw error
    }
    if (error instanceof Error) {
      throw new TikTokAdsTokenExpiredError(error.message)
    }
    throw new TikTokAdsTokenExpiredError('TikTok-Token konnte nicht erneuert werden.')
  }
}

export async function listTikTokAdvertisers(accessToken: string): Promise<TikTokAdvertiser[]> {
  const url = new URL(`${TIKTOK_API_BASE}/oauth2/advertiser/get/`)
  url.searchParams.set('app_id', process.env.TIKTOK_APP_ID || process.env.TIKTOK_CLIENT_KEY || '')
  url.searchParams.set('secret', process.env.TIKTOK_APP_SECRET || '')
  url.searchParams.set('access_token', accessToken)

  const data = await fetchTikTokJson<TikTokListResponse<TikTokAdvertiserEntry>>(url)

  return extractTikTokList(data, 'advertiser/get')
    .map((entry) => ({
      id: normalizeId(entry.advertiser_id),
      name: entry.advertiser_name || entry.name || `Advertiser ${normalizeId(entry.advertiser_id)}`,
      currency: entry.currency,
    }))
    .filter((entry) => entry.id)
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchTikTokCampaigns(options: {
  accessToken: string
  advertiserId: string
}): Promise<TikTokCampaignEntry[]> {
  const url = new URL(`${TIKTOK_API_BASE}/campaign/get/`)
  url.searchParams.set('advertiser_id', options.advertiserId)
  url.searchParams.set('page', '1')
  url.searchParams.set('page_size', '1000')

  const data = await fetchTikTokJson<TikTokListResponse<TikTokCampaignEntry>>(url, {
    headers: {
      'Access-Token': options.accessToken,
      'Content-Type': 'application/json',
    },
  })

  return extractTikTokList(data, 'campaign/get')
}

async function fetchTikTokCampaignReport(options: {
  accessToken: string
  advertiserId: string
  startDate: string
  endDate: string
}): Promise<TikTokReportRow[]> {
  const url = new URL(`${TIKTOK_API_BASE}/report/integrated/get/`)

  const body = {
    advertiser_id: options.advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_CAMPAIGN',
    dimensions: ['campaign_id', 'campaign_name'],
    metrics: [...TIKTOK_REPORT_METRICS],
    start_date: options.startDate,
    end_date: options.endDate,
    page: 1,
    page_size: 1000,
  }

  const data = await fetchTikTokJson<TikTokListResponse<TikTokReportRow>>(url, {
    method: 'POST',
    headers: {
      'Access-Token': options.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const rows = extractTikTokList(data, 'report/integrated/get')
  const hasRecognizableShape = rows.every((row) => {
    if (!row || typeof row !== 'object') return false
    return Boolean(
      row.campaign_id ||
        row.dimensions?.campaign_id ||
        row.clicks !== undefined ||
        row.click_cnt !== undefined ||
        row.spend !== undefined ||
        row.stat_cost !== undefined ||
        row.video_play_actions !== undefined ||
        row.metrics
    )
  })

  if (!hasRecognizableShape) {
    throw new TikTokAdsContractError(
      'TikTok Report-Antwort verwendet ein unerwartetes Feldschema und konnte nicht gemappt werden.'
    )
  }

  return rows
}

async function fetchTikTokCostTimeseries(options: {
  accessToken: string
  advertiserId: string
  startDate: string
  endDate: string
}): Promise<{ label: string; value: number }[]> {
  const url = new URL(`${TIKTOK_API_BASE}/report/integrated/get/`)

  const body = {
    advertiser_id: options.advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_ADVERTISER',
    dimensions: ['stat_time_day'],
    metrics: ['spend'],
    start_date: options.startDate,
    end_date: options.endDate,
    page: 1,
    page_size: 1000,
  }

  const data = await fetchTikTokJson<TikTokListResponse<TikTokReportRow>>(url, {
    method: 'POST',
    headers: {
      'Access-Token': options.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return extractTikTokList(data, 'report/integrated/get')
    .map((row) => ({
      label: String(row.dimensions?.stat_time_day ?? ''),
      value: getReportCost(row),
    }))
    .filter((point) => point.label)
    .sort((a, b) => a.label.localeCompare(b.label))
}

function getReportCampaignId(row: TikTokReportRow): string {
  return normalizeId(row.campaign_id || row.dimensions?.campaign_id)
}

function getReportClicks(row: TikTokReportRow): number {
  return parseNumber(row.clicks ?? row.click_cnt ?? row.metrics?.clicks ?? row.metrics?.click_cnt)
}

function getReportVideoViews(row: TikTokReportRow): number {
  return parseNumber(
    row.video_play_actions ?? row.video_views ?? row.metrics?.video_play_actions ?? row.metrics?.video_views
  )
}

function getReportCost(row: TikTokReportRow): number {
  return parseNumber(row.spend ?? row.cost ?? row.stat_cost ?? row.metrics?.spend ?? row.metrics?.cost ?? row.metrics?.stat_cost)
}

function mapTikTokRowsToDashboard(options: {
  campaignRows: TikTokCampaignEntry[]
  reportRows: TikTokReportRow[]
  currency?: string
}): TikTokAdsDashboardData {
  const reportByCampaign = new Map(options.reportRows.map((row) => [getReportCampaignId(row), row]))

  const campaigns = options.campaignRows.map((campaign) => {
    const campaignId = normalizeId(campaign.campaign_id)
    const report = reportByCampaign.get(campaignId)
    const clicks = report ? getReportClicks(report) : 0
    const cost = report ? getReportCost(report) : 0
    const videoViews = report ? getReportVideoViews(report) : 0

    return {
      id: campaignId,
      name: campaign.campaign_name || (report?.campaign_name ?? `Kampagne ${campaignId}`),
      status: normalizeStatus(campaign.status || campaign.secondary_status || campaign.operation_status),
      videoViews,
      clicks,
      cost,
      cpc: clicks > 0 ? cost / clicks : 0,
    }
  })

  const campaignIds = new Set(campaigns.map((campaign) => campaign.id))
  for (const row of options.reportRows) {
    const campaignId = getReportCampaignId(row)
    if (!campaignId || campaignIds.has(campaignId)) continue

    const clicks = getReportClicks(row)
    const cost = getReportCost(row)
    const videoViews = getReportVideoViews(row)
    campaigns.push({
      id: campaignId,
      name: row.campaign_name || `Kampagne ${campaignId}`,
      status: undefined,
      videoViews,
      clicks,
      cost,
      cpc: clicks > 0 ? cost / clicks : 0,
    })
  }

  const totalCost = campaigns.reduce((sum, campaign) => sum + campaign.cost, 0)
  const totalClicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0)
  const totalVideoViews = campaigns.reduce((sum, campaign) => sum + campaign.videoViews, 0)
  const activeCampaigns = campaigns.filter((campaign) => {
    const status = campaign.status?.toLowerCase()
    return !status || status === 'active' || status === 'enabled'
  }).length

  return {
    campaigns: campaigns.sort((a, b) => b.cost - a.cost),
    totalCost,
    totalClicks,
    totalVideoViews,
    averageCpc: totalClicks > 0 ? totalCost / totalClicks : 0,
    activeCampaigns,
    currency: options.currency,
  }
}

function getCachedSnapshot(
  credentials: TikTokAdsCredentials,
  range: TikTokAdsDateRangeKey
): TikTokAdsDashboardData | null {
  return credentials.cached_snapshots?.[range] ?? null
}

function getCacheAgeMinutes(
  credentials: TikTokAdsCredentials,
  range: TikTokAdsDateRangeKey
): number | undefined {
  const cachedAt = credentials.cached_at_by_range?.[range]
  if (!cachedAt) return undefined
  return Math.max(0, Math.round((Date.now() - new Date(cachedAt).getTime()) / 60_000))
}

function isCacheValid(credentials: TikTokAdsCredentials, range: TikTokAdsDateRangeKey): boolean {
  const cachedAt = credentials.cached_at_by_range?.[range]
  if (!cachedAt) return false
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS
}

async function storeCachedSnapshot(
  integrationId: string,
  credentials: TikTokAdsCredentials,
  range: TikTokAdsDateRangeKey,
  data: TikTokAdsDashboardData
) {
  const nextCredentials: TikTokAdsCredentials = {
    ...credentials,
    cached_snapshots: {
      ...(credentials.cached_snapshots ?? {}),
      [range]: data,
    },
    cached_at_by_range: {
      ...(credentials.cached_at_by_range ?? {}),
      [range]: new Date().toISOString(),
    },
  }

  await saveTikTokAdsIntegrationCredentials({
    integrationId,
    credentials: nextCredentials,
    status: 'connected',
  })

  return nextCredentials
}

export async function getTikTokAdsDashboardSnapshot(
  integration: TikTokAdsIntegrationRecord,
  credentials: TikTokAdsCredentials,
  range: TikTokAdsDateRangeKey
): Promise<{ data: TikTokAdsDashboardData; trend: number | null }> {
  if (!credentials.selected_advertiser_id) {
    return {
      data: {
        campaigns: [],
        totalCost: 0,
        totalClicks: 0,
        totalVideoViews: 0,
        averageCpc: 0,
        activeCampaigns: 0,
        currency: credentials.currency,
        message: 'Es wurde noch kein TikTok Advertiser fuer diesen Kunden ausgewaehlt.',
      },
      trend: null,
    }
  }

  const { startDate, endDate, compareStartDate, compareEndDate } = getDateRange(range)
  const selectedAdvertiserId = credentials.selected_advertiser_id

  try {
    const { accessToken, credentials: refreshedCredentials } = await getValidTikTokAdsToken(
      integration.id,
      credentials
    )
    const advertiserId = refreshedCredentials.selected_advertiser_id ?? selectedAdvertiserId

    if (!advertiserId) {
      return {
        data: {
          campaigns: [],
          totalCost: 0,
          totalClicks: 0,
          totalVideoViews: 0,
          averageCpc: 0,
          activeCampaigns: 0,
          currency: refreshedCredentials.currency,
          message: 'Es wurde noch kein TikTok Advertiser fuer diesen Kunden ausgewaehlt.',
        },
        trend: null,
      }
    }

    const [currentCampaigns, currentReport, previousReport, timeseries] = await Promise.all([
      fetchTikTokCampaigns({ accessToken, advertiserId }),
      fetchTikTokCampaignReport({ accessToken, advertiserId, startDate, endDate }),
      fetchTikTokCampaignReport({
        accessToken,
        advertiserId,
        startDate: compareStartDate,
        endDate: compareEndDate,
      }),
      fetchTikTokCostTimeseries({
        accessToken,
        advertiserId,
        startDate,
        endDate,
      }),
    ])

    const current = mapTikTokRowsToDashboard({
      campaignRows: currentCampaigns,
      reportRows: currentReport,
      currency: refreshedCredentials.currency,
    })
    current.timeseries = timeseries
    const previous = mapTikTokRowsToDashboard({
      campaignRows: currentCampaigns,
      reportRows: previousReport,
      currency: refreshedCredentials.currency,
    })

    await storeCachedSnapshot(integration.id, refreshedCredentials, range, current)

    const trend = previous.totalCost > 0 ? ((current.totalCost - previous.totalCost) / previous.totalCost) * 100 : null

    return { data: current, trend }
  } catch (error) {
    if (error instanceof TikTokAdsRateLimitError) {
      const cached = getCachedSnapshot(credentials, range)
      if (cached && isCacheValid(credentials, range)) {
        return {
          data: {
            ...cached,
            isCached: true,
            cacheAgeMinutes: getCacheAgeMinutes(credentials, range),
          },
          trend: null,
        }
      }
    }

    if (error instanceof TikTokAdsContractError) {
      throw error
    }

    throw error
  }
}

export class TikTokAdsRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TikTokAdsRateLimitError'
  }
}

export class TikTokAdsContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TikTokAdsContractError'
  }
}
