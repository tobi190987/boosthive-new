import { decryptCredentials, encryptCredentials } from '@/lib/customer-credentials-encryption'
import {
  exchangeForLongLivedMetaToken,
  MetaAdsTokenExpiredError,
} from '@/lib/meta-ads-oauth'
import { createAdminClient } from '@/lib/supabase-admin'

const META_GRAPH_API = 'https://graph.facebook.com/v24.0'
const CACHE_TTL_MS = 15 * 60 * 1000
const TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type MetaAdsDateRangeKey = 'today' | '7d' | '30d' | '90d'

export interface MetaAdsAccount {
  id: string
  name: string
  businessName?: string
  currency?: string
}

export interface MetaAdsCampaign {
  name: string
  reach: number
  impressions: number
  cpm: number
  conversions: number
}

export interface MetaAdsDashboardData {
  campaigns: MetaAdsCampaign[]
  totalCost: number
  avgCpm: number
  totalReach: number
  totalImpressions: number
  totalConversions: number
  timeseries?: { label: string; value: number }[]
  currency?: string
  isCached?: boolean
  cacheAgeMinutes?: number
  message?: string
}

export interface MetaAdsCredentials {
  access_token: string
  token_expiry: string
  meta_user_id: string
  meta_user_name: string
  selected_ad_account_id?: string
  selected_ad_account_name?: string
  business_name?: string
  currency?: string
  cached_snapshots?: Partial<Record<MetaAdsDateRangeKey, MetaAdsDashboardData>>
  cached_at_by_range?: Partial<Record<MetaAdsDateRangeKey, string>>
}

export interface MetaAdsIntegrationRecord {
  id: string
  customer_id: string
  integration_type: string
  status: string
  credentials_encrypted: string | null
}

interface MetaAdsInsightRow {
  date_start?: string
  campaign_name?: string
  reach?: string
  impressions?: string
  spend?: string
  cpm?: string
  actions?: { action_type?: string; value?: string }[]
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getDateRange(range: MetaAdsDateRangeKey) {
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

function normalizeAdAccountId(accountId: string): string {
  const trimmed = accountId.trim()
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed.replace(/^act_/, '')}`
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function calculateConversions(actions: MetaAdsInsightRow['actions']): number {
  if (!actions?.length) return 0

  const relevantActions = new Set([
    'purchase',
    'omni_purchase',
    'lead',
    'omni_lead',
    'complete_registration',
    'onsite_conversion.purchase',
    'onsite_conversion.lead',
    'offsite_conversion.fb_pixel_purchase',
    'offsite_conversion.fb_pixel_lead',
    'app_custom_event.fb_mobile_purchase',
    'app_custom_event.fb_mobile_complete_registration',
  ])

  return actions.reduce((sum, action) => {
    if (!action.action_type || !relevantActions.has(action.action_type)) return sum
    return sum + parseNumber(action.value)
  }, 0)
}

export function parseMetaAdsCredentials(encrypted: string | null): MetaAdsCredentials | null {
  if (!encrypted) return null
  return decryptCredentials(encrypted) as MetaAdsCredentials
}

export async function getMetaAdsIntegration(
  _tenantId: string,
  customerId: string
): Promise<MetaAdsIntegrationRecord | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customer_integrations')
    .select('id, customer_id, integration_type, status, credentials_encrypted')
    .eq('customer_id', customerId)
    .eq('integration_type', 'meta_ads')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as MetaAdsIntegrationRecord | null) ?? null
}

export async function saveMetaAdsIntegrationCredentials(options: {
  integrationId: string
  credentials: MetaAdsCredentials
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

export async function upsertMetaAdsConnection(options: {
  customerId: string
  userId: string
  accessToken: string
  tokenExpiry: string
  metaUserId: string
  metaUserName: string
}) {
  const admin = createAdminClient()
  const existing = await getMetaAdsIntegration('', options.customerId)
  const existingCredentials = parseMetaAdsCredentials(existing?.credentials_encrypted ?? null)

  const nextCredentials: MetaAdsCredentials = {
    access_token: options.accessToken,
    token_expiry: options.tokenExpiry,
    meta_user_id: options.metaUserId,
    meta_user_name: options.metaUserName,
    selected_ad_account_id: existingCredentials?.selected_ad_account_id,
    selected_ad_account_name: existingCredentials?.selected_ad_account_name,
    business_name: existingCredentials?.business_name,
    currency: existingCredentials?.currency,
    cached_snapshots: existingCredentials?.cached_snapshots,
    cached_at_by_range: existingCredentials?.cached_at_by_range,
  }

  const { data, error } = await admin
    .from('customer_integrations')
    .upsert(
      {
        customer_id: options.customerId,
        integration_type: 'meta_ads',
        status: 'connected',
        credentials_encrypted: encryptCredentials(nextCredentials),
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

export async function disconnectMetaAdsIntegration(integrationId: string) {
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

export async function getValidMetaAdsToken(
  integrationId: string,
  credentials: MetaAdsCredentials
): Promise<{ accessToken: string; credentials: MetaAdsCredentials }> {
  const expiryMs = new Date(credentials.token_expiry).getTime()
  if (expiryMs <= Date.now()) {
    const admin = createAdminClient()
    await admin
      .from('customer_integrations')
      .update({ status: 'token_expired', updated_at: new Date().toISOString() })
      .eq('id', integrationId)
    throw new MetaAdsTokenExpiredError('Meta-Ads-Token ist abgelaufen.')
  }

  if (expiryMs - Date.now() >= TOKEN_REFRESH_WINDOW_MS) {
    return { accessToken: credentials.access_token, credentials }
  }

  try {
    const refreshed = await exchangeForLongLivedMetaToken(credentials.access_token)
    const nextCredentials: MetaAdsCredentials = {
      ...credentials,
      access_token: refreshed.access_token,
      token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }

    await saveMetaAdsIntegrationCredentials({
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

    if (error instanceof Error) {
      throw new MetaAdsTokenExpiredError(error.message)
    }
    throw new MetaAdsTokenExpiredError('Meta-Ads-Token konnte nicht erneuert werden.')
  }
}

async function fetchMetaJson<T>(url: URL): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.text().catch(() => '')
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new MetaAdsTokenExpiredError(
        `Meta API Zugriff fehlgeschlagen: ${response.status} ${error}`
      )
    }
    if (response.status === 429) {
      throw new MetaAdsRateLimitError('Meta API Rate Limit erreicht.')
    }
    throw new Error(`Meta API Fehler: ${response.status} ${error}`)
  }

  return response.json() as Promise<T>
}

export async function listMetaAdsAccounts(accessToken: string): Promise<MetaAdsAccount[]> {
  const url = new URL(`${META_GRAPH_API}/me/adaccounts`)
  url.searchParams.set('fields', 'id,name,account_id,currency,business{name}')
  url.searchParams.set('limit', '200')
  url.searchParams.set('access_token', accessToken)

  const data = await fetchMetaJson<{
    data?: {
      id?: string
      name?: string
      account_id?: string
      currency?: string
      business?: { name?: string }
    }[]
  }>(url)

  return (data.data ?? [])
    .filter((entry) => entry.id && entry.name)
    .map((entry) => ({
      id: normalizeAdAccountId(entry.id ?? entry.account_id ?? ''),
      name: entry.name ?? 'Unbenannter Ad Account',
      businessName: entry.business?.name,
      currency: entry.currency,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function mapInsightRowsToDashboard(
  rows: MetaAdsInsightRow[],
  currency?: string
): MetaAdsDashboardData {
  const campaigns = rows.map((row) => ({
    name: row.campaign_name || 'Unbenannte Kampagne',
    reach: parseNumber(row.reach),
    impressions: parseNumber(row.impressions),
    cpm: parseNumber(row.cpm),
    conversions: calculateConversions(row.actions),
  }))

  const totalCost = rows.reduce((sum, row) => sum + parseNumber(row.spend), 0)
  const totalReach = campaigns.reduce((sum, campaign) => sum + campaign.reach, 0)
  const totalImpressions = campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0)
  const totalConversions = campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0)

  return {
    campaigns,
    totalCost,
    avgCpm: totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0,
    totalReach,
    totalImpressions,
    totalConversions,
    currency,
  }
}

async function fetchMetaAdsInsights(options: {
  accessToken: string
  adAccountId: string
  startDate: string
  endDate: string
  currency?: string
}): Promise<MetaAdsDashboardData> {
  const url = new URL(`${META_GRAPH_API}/${normalizeAdAccountId(options.adAccountId)}/insights`)
  url.searchParams.set(
    'fields',
    ['campaign_id', 'campaign_name', 'reach', 'impressions', 'spend', 'cpm', 'actions'].join(',')
  )
  url.searchParams.set('level', 'campaign')
  url.searchParams.set('time_increment', 'all_days')
  url.searchParams.set('limit', '500')
  url.searchParams.set(
    'time_range',
    JSON.stringify({ since: options.startDate, until: options.endDate })
  )
  url.searchParams.set('access_token', options.accessToken)

  const data = await fetchMetaJson<{ data?: MetaAdsInsightRow[] }>(url)
  return mapInsightRowsToDashboard(data.data ?? [], options.currency)
}

async function fetchMetaAdsCostTimeseries(options: {
  accessToken: string
  adAccountId: string
  startDate: string
  endDate: string
}): Promise<{ label: string; value: number }[]> {
  const url = new URL(`${META_GRAPH_API}/${normalizeAdAccountId(options.adAccountId)}/insights`)
  url.searchParams.set('fields', 'date_start,spend')
  url.searchParams.set('level', 'account')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('limit', '500')
  url.searchParams.set(
    'time_range',
    JSON.stringify({ since: options.startDate, until: options.endDate })
  )
  url.searchParams.set('access_token', options.accessToken)

  const data = await fetchMetaJson<{ data?: MetaAdsInsightRow[] }>(url)

  return (data.data ?? [])
    .map((row) => ({
      label: row.date_start ?? '',
      value: parseNumber(row.spend),
    }))
    .filter((point) => point.label)
    .sort((a, b) => a.label.localeCompare(b.label))
}

function getCachedSnapshot(
  credentials: MetaAdsCredentials,
  range: MetaAdsDateRangeKey
): MetaAdsDashboardData | null {
  return credentials.cached_snapshots?.[range] ?? null
}

function getCacheAgeMinutes(
  credentials: MetaAdsCredentials,
  range: MetaAdsDateRangeKey
): number | undefined {
  const cachedAt = credentials.cached_at_by_range?.[range]
  if (!cachedAt) return undefined
  return Math.max(0, Math.round((Date.now() - new Date(cachedAt).getTime()) / 60_000))
}

function isCacheValid(credentials: MetaAdsCredentials, range: MetaAdsDateRangeKey): boolean {
  const cachedAt = credentials.cached_at_by_range?.[range]
  if (!cachedAt) return false
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS
}

async function storeCachedSnapshot(
  integrationId: string,
  credentials: MetaAdsCredentials,
  range: MetaAdsDateRangeKey,
  data: MetaAdsDashboardData
) {
  const nextCredentials: MetaAdsCredentials = {
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

  await saveMetaAdsIntegrationCredentials({
    integrationId,
    credentials: nextCredentials,
    status: 'connected',
  })

  return nextCredentials
}

export async function getMetaAdsDashboardSnapshot(
  integration: MetaAdsIntegrationRecord,
  credentials: MetaAdsCredentials,
  range: MetaAdsDateRangeKey
): Promise<{ data: MetaAdsDashboardData; trend: number | null }> {
  if (!credentials.selected_ad_account_id) {
    return {
      data: {
        campaigns: [],
        totalCost: 0,
        avgCpm: 0,
        totalReach: 0,
        totalImpressions: 0,
        totalConversions: 0,
        currency: credentials.currency,
        message: 'Es wurde noch kein Meta Ad Account fuer diesen Kunden ausgewaehlt.',
      },
      trend: null,
    }
  }

  const { startDate, endDate, compareStartDate, compareEndDate } = getDateRange(range)
  const selectedAdAccountId = credentials.selected_ad_account_id

  try {
    const { accessToken, credentials: refreshedCredentials } = await getValidMetaAdsToken(
      integration.id,
      credentials
    )
    const activeAdAccountId =
      refreshedCredentials.selected_ad_account_id ?? selectedAdAccountId

    if (!activeAdAccountId) {
      return {
        data: {
          campaigns: [],
          totalCost: 0,
          avgCpm: 0,
          totalReach: 0,
          totalImpressions: 0,
          totalConversions: 0,
          currency: refreshedCredentials.currency,
          message: 'Es wurde noch kein Meta Ad Account fuer diesen Kunden ausgewaehlt.',
        },
        trend: null,
      }
    }

    const [current, previous, timeseries] = await Promise.all([
      fetchMetaAdsInsights({
        accessToken,
        adAccountId: activeAdAccountId,
        startDate,
        endDate,
        currency: refreshedCredentials.currency,
      }),
      fetchMetaAdsInsights({
        accessToken,
        adAccountId: activeAdAccountId,
        startDate: compareStartDate,
        endDate: compareEndDate,
        currency: refreshedCredentials.currency,
      }),
      fetchMetaAdsCostTimeseries({
        accessToken,
        adAccountId: activeAdAccountId,
        startDate,
        endDate,
      }),
    ])

    current.timeseries = timeseries

    await storeCachedSnapshot(integration.id, refreshedCredentials, range, current)

    const trend =
      previous.avgCpm > 0 ? ((current.avgCpm - previous.avgCpm) / previous.avgCpm) * 100 : null

    return { data: current, trend }
  } catch (error) {
    if (error instanceof MetaAdsRateLimitError) {
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

    throw error
  }
}

export class MetaAdsRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetaAdsRateLimitError'
  }
}
