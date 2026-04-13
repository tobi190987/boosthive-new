import { decryptCredentials, encryptCredentials } from '@/lib/customer-credentials-encryption'
import {
  GoogleAdsTokenRevokedError,
  refreshGoogleAdsAccessToken,
} from '@/lib/google-ads-oauth'
import { createAdminClient } from '@/lib/supabase-admin'

// v18 is sunset; use a currently supported Google Ads API version.
const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v22'
const CACHE_TTL_MS = 15 * 60 * 1000

export interface GoogleAdsAccount {
  id: string
  name: string
  currency?: string
  managerCustomerId?: string
  isManager?: boolean
}

export interface GoogleAdsCredentials {
  access_token: string
  refresh_token: string
  token_expiry: string
  google_email: string
  google_ads_customer_id?: string
  google_ads_customer_name?: string
  google_ads_manager_customer_id?: string
  currency_code?: string
  cached_snapshots?: Partial<Record<GoogleAdsDateRangeKey, GoogleAdsDashboardData>>
  cached_at_by_range?: Partial<Record<GoogleAdsDateRangeKey, string>>
}

export interface GoogleAdsIntegrationRecord {
  id: string
  customer_id: string
  integration_type: string
  status: string
  credentials_encrypted: string | null
}

export type GoogleAdsDateRangeKey = 'today' | '7d' | '30d' | '90d'

export interface GoogleAdsCampaign {
  id: string
  name: string
  status: string
  budget: number
  clicks: number
  cost: number
  conversions: number
}

export interface GoogleAdsDashboardData {
  campaigns: GoogleAdsCampaign[]
  totalCost: number
  avgCpc: number
  totalConversions: number
  timeseries?: { label: string; value: number }[]
  currency?: string
  isCached?: boolean
  cacheAgeMinutes?: number
  message?: string
}

interface AccessibleCustomersResponse {
  resourceNames?: string[]
}

interface GoogleAdsSearchStreamRow {
  segments?: {
    date?: string
  }
  customer?: {
    id?: string | number
    descriptiveName?: string
    currencyCode?: string
    manager?: boolean
  }
  customerClient?: {
    id?: string | number
    descriptiveName?: string
    currencyCode?: string
    manager?: boolean
    level?: string | number
  }
  campaign?: {
    id?: string | number
    name?: string
    status?: string
  }
  campaignBudget?: {
    amountMicros?: string | number
  }
  metrics?: {
    clicks?: string | number
    costMicros?: string | number
    conversions?: string | number
  }
}

interface GoogleAdsSearchStreamBatch {
  results?: GoogleAdsSearchStreamRow[]
}

function getDeveloperToken(): string {
  const value = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!value) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN ist nicht gesetzt.')
  return value
}

function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/\D/g, '')
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getDateRange(range: GoogleAdsDateRangeKey) {
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

function parseNumber(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function buildGoogleAdsHeaders(accessToken: string, loginCustomerId?: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': getDeveloperToken(),
    'Content-Type': 'application/json',
  }

  if (loginCustomerId) {
    headers['login-customer-id'] = normalizeCustomerId(loginCustomerId)
  }

  return headers
}

async function fetchGoogleAdsJson<T>(
  url: string,
  init: RequestInit,
  options?: { tokenErrorMessage?: string }
): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text().catch(() => '')

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GoogleAdsTokenRevokedError(
        options?.tokenErrorMessage ?? `Google Ads API Zugriff fehlgeschlagen: ${response.status}`
      )
    }
    throw new Error(`Google Ads API Fehler: ${response.status} ${text}`)
  }

  return text ? (JSON.parse(text) as T) : ({} as T)
}

function toSafeGoogleAdsErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : fallback
  const normalized = raw.toLowerCase()

  if (normalized.includes('google_ads_developer_token')) {
    return 'Google Ads API ist nicht vollständig konfiguriert: GOOGLE_ADS_DEVELOPER_TOKEN fehlt.'
  }

  if (normalized.includes('developer token')) {
    return 'Google Ads Developer Token wurde von der API nicht akzeptiert. Bitte API Center prüfen.'
  }

  if (normalized.includes('access-denied') || normalized.includes('permission_denied')) {
    return 'Das verbundene Google-Konto hat keinen ausreichenden Zugriff auf Google Ads.'
  }

  if (normalized.includes('customer id') || normalized.includes('listaccessiblecustomers')) {
    return 'Google Ads Konten konnten nicht gelesen werden. Bitte API-Version und Kontozugriff prüfen.'
  }

  if (normalized.includes('404') || normalized.includes('<!doctype html>')) {
    return 'Google Ads API-Endpunkt wurde nicht gefunden. Bitte API-Version prüfen.'
  }

  return fallback
}

export function parseGoogleAdsCredentials(encrypted: string | null): GoogleAdsCredentials | null {
  if (!encrypted) return null
  return decryptCredentials(encrypted) as GoogleAdsCredentials
}

export async function getGoogleAdsIntegration(
  _tenantId: string,
  customerId: string
): Promise<GoogleAdsIntegrationRecord | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customer_integrations')
    .select('id, customer_id, integration_type, status, credentials_encrypted')
    .eq('customer_id', customerId)
    .eq('integration_type', 'google_ads')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as GoogleAdsIntegrationRecord | null) ?? null
}

export async function saveGoogleAdsIntegrationCredentials(options: {
  integrationId: string
  credentials: GoogleAdsCredentials
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

export async function upsertGoogleAdsConnection(options: {
  customerId: string
  userId: string
  googleEmail: string
  accessToken: string
  refreshToken: string
  tokenExpiry: string
}) {
  const admin = createAdminClient()
  const existing = await getGoogleAdsIntegration('', options.customerId)
  const existingCredentials = parseGoogleAdsCredentials(existing?.credentials_encrypted ?? null)

  const nextCredentials: GoogleAdsCredentials = {
    access_token: options.accessToken,
    refresh_token: options.refreshToken,
    token_expiry: options.tokenExpiry,
    google_email: options.googleEmail,
    google_ads_customer_id: existingCredentials?.google_ads_customer_id,
    google_ads_customer_name: existingCredentials?.google_ads_customer_name,
    google_ads_manager_customer_id: existingCredentials?.google_ads_manager_customer_id,
    currency_code: existingCredentials?.currency_code,
    cached_snapshots: existingCredentials?.cached_snapshots,
    cached_at_by_range: existingCredentials?.cached_at_by_range,
  }

  const { data, error } = await admin
    .from('customer_integrations')
    .upsert(
      {
        customer_id: options.customerId,
        integration_type: 'google_ads',
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

export async function disconnectGoogleAdsIntegration(integrationId: string) {
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

export async function getValidGoogleAdsToken(
  integrationId: string,
  credentials: GoogleAdsCredentials
): Promise<{ accessToken: string; credentials: GoogleAdsCredentials }> {
  const expiryDate = new Date(credentials.token_expiry)

  if (expiryDate.getTime() - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed = await refreshGoogleAdsAccessToken(credentials.refresh_token)
      const nextCredentials: GoogleAdsCredentials = {
        ...credentials,
        access_token: refreshed.access_token,
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }

      await saveGoogleAdsIntegrationCredentials({
        integrationId,
        credentials: nextCredentials,
        status: 'connected',
      })

      return { accessToken: refreshed.access_token, credentials: nextCredentials }
    } catch (error) {
      if (error instanceof GoogleAdsTokenRevokedError) {
        const admin = createAdminClient()
        await admin
          .from('customer_integrations')
          .update({
            status: 'token_expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', integrationId)
      }
      throw error
    }
  }

  return { accessToken: credentials.access_token, credentials }
}

async function getAccessibleCustomerIds(accessToken: string): Promise<string[]> {
  const data = await fetchGoogleAdsJson<AccessibleCustomersResponse>(
    `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
    {
      method: 'GET',
      headers: buildGoogleAdsHeaders(accessToken),
    },
    { tokenErrorMessage: 'Google-Ads-Token ist abgelaufen oder wurde widerrufen.' }
  )

  return (data.resourceNames ?? [])
    .map((resourceName) => resourceName.split('/').pop() ?? '')
    .map(normalizeCustomerId)
    .filter(Boolean)
}

async function getCustomerDetails(
  accessToken: string,
  customerId: string
): Promise<GoogleAdsAccount | null> {
  const normalizedCustomerId = normalizeCustomerId(customerId)
  if (!normalizedCustomerId) return null

  const batches = await fetchGoogleAdsJson<GoogleAdsSearchStreamBatch[]>(
    `${GOOGLE_ADS_API_BASE}/customers/${normalizedCustomerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: buildGoogleAdsHeaders(accessToken, normalizedCustomerId),
      body: JSON.stringify({
        query: `
          SELECT
            customer.id,
            customer.descriptive_name,
            customer.currency_code,
            customer.manager
          FROM customer
          LIMIT 1
        `,
      }),
    },
    { tokenErrorMessage: 'Google-Ads-Token ist abgelaufen oder wurde widerrufen.' }
  )

  const row = batches.flatMap((batch) => batch.results ?? [])[0]
  const customer = row?.customer
  if (!customer?.id) return null

  return {
    id: normalizeCustomerId(String(customer.id)),
    name: customer.descriptiveName || normalizeCustomerId(String(customer.id)),
    currency: customer.currencyCode,
    isManager: Boolean(customer.manager),
  }
}

async function getManagerChildAccounts(
  accessToken: string,
  managerCustomerId: string
): Promise<GoogleAdsAccount[]> {
  const normalizedManagerCustomerId = normalizeCustomerId(managerCustomerId)
  if (!normalizedManagerCustomerId) return []

  const batches = await fetchGoogleAdsJson<GoogleAdsSearchStreamBatch[]>(
    `${GOOGLE_ADS_API_BASE}/customers/${normalizedManagerCustomerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: buildGoogleAdsHeaders(accessToken, normalizedManagerCustomerId),
      body: JSON.stringify({
        query: `
          SELECT
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.currency_code,
            customer_client.manager,
            customer_client.level
          FROM customer_client
          WHERE customer_client.level >= 1
        `,
      }),
    },
    { tokenErrorMessage: 'Google-Ads-Token ist abgelaufen oder wurde widerrufen.' }
  )

  const accounts: GoogleAdsAccount[] = []

  for (const row of batches.flatMap((batch) => batch.results ?? [])) {
    const customerClient = row.customerClient
    if (!customerClient?.id) continue

    const account: GoogleAdsAccount = {
      id: normalizeCustomerId(String(customerClient.id)),
      name:
        customerClient.descriptiveName || normalizeCustomerId(String(customerClient.id)),
      currency: customerClient.currencyCode,
      managerCustomerId: normalizedManagerCustomerId,
      isManager: Boolean(customerClient.manager),
    }

    if (!account.isManager) {
      accounts.push(account)
    }
  }

  return accounts
}

export async function listGoogleAdsAccounts(accessToken: string): Promise<GoogleAdsAccount[]> {
  try {
    const customerIds = await getAccessibleCustomerIds(accessToken)
    const directAccountResults = await Promise.allSettled(
      customerIds.map((customerId) => getCustomerDetails(accessToken, customerId))
    )

    const directAccounts: GoogleAdsAccount[] = []
    for (const result of directAccountResults) {
      if (result.status === 'fulfilled') {
        if (result.value) directAccounts.push(result.value)
        continue
      }

      console.error('[google-ads] Direktes Konto konnte nicht geladen werden:', result.reason)
    }

    const managerChildResults = await Promise.allSettled(
      directAccounts
        .filter((account) => account.isManager)
        .map((account) => getManagerChildAccounts(accessToken, account.id))
    )

    const managerChildAccounts: GoogleAdsAccount[] = []
    for (const result of managerChildResults) {
      if (result.status === 'fulfilled') {
        managerChildAccounts.push(...result.value)
        continue
      }

      console.error('[google-ads] MCC-Unterkonten konnten nicht geladen werden:', result.reason)
    }

    const combined = [...directAccounts, ...managerChildAccounts]
    const deduped = new Map<string, GoogleAdsAccount>()

    for (const account of combined) {
      if (!account.id) continue
      if (!deduped.has(account.id) || (!account.isManager && deduped.get(account.id)?.isManager)) {
        deduped.set(account.id, account)
      }
    }

    return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    throw new Error(
      toSafeGoogleAdsErrorMessage(error, 'Google-Ads-Accounts konnten nicht geladen werden.')
    )
  }
}

async function fetchGoogleAdsCampaignSnapshot(options: {
  accessToken: string
  customerId: string
  managerCustomerId?: string
  startDate: string
  endDate: string
  currency?: string
}): Promise<GoogleAdsDashboardData> {
  const customerId = normalizeCustomerId(options.customerId)
  const managerCustomerId = normalizeCustomerId(options.managerCustomerId ?? '')
  const batches = await fetchGoogleAdsJson<GoogleAdsSearchStreamBatch[]>(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: buildGoogleAdsHeaders(options.accessToken, managerCustomerId || customerId),
      body: JSON.stringify({
        query: `
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign_budget.amount_micros,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions
          FROM campaign
          WHERE segments.date BETWEEN '${options.startDate}' AND '${options.endDate}'
        `,
      }),
    },
    { tokenErrorMessage: 'Google-Ads-Token ist abgelaufen oder wurde widerrufen.' }
  )

  const campaigns = batches
    .flatMap((batch) => batch.results ?? [])
    .map((row) => {
      const clicks = parseNumber(row.metrics?.clicks)
      const cost = parseNumber(row.metrics?.costMicros) / 1_000_000
      const conversions = parseNumber(row.metrics?.conversions)
      const budget = parseNumber(row.campaignBudget?.amountMicros) / 1_000_000

      return {
        id: String(row.campaign?.id ?? ''),
        name: row.campaign?.name || 'Unbenannte Kampagne',
        status: row.campaign?.status || 'UNKNOWN',
        budget,
        clicks,
        cost,
        conversions,
      }
    })
    .sort((a, b) => b.cost - a.cost)

  const totalCost = campaigns.reduce((sum, campaign) => sum + campaign.cost, 0)
  const totalClicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0)
  const totalConversions = campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0)

  return {
    campaigns,
    totalCost,
    avgCpc: totalClicks > 0 ? totalCost / totalClicks : 0,
    totalConversions,
    currency: options.currency,
  }
}

async function fetchGoogleAdsCostTimeseries(options: {
  accessToken: string
  customerId: string
  managerCustomerId?: string
  startDate: string
  endDate: string
}): Promise<{ label: string; value: number }[]> {
  const customerId = normalizeCustomerId(options.customerId)
  const managerCustomerId = normalizeCustomerId(options.managerCustomerId ?? '')
  const batches = await fetchGoogleAdsJson<GoogleAdsSearchStreamBatch[]>(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: buildGoogleAdsHeaders(options.accessToken, managerCustomerId || customerId),
      body: JSON.stringify({
        query: `
          SELECT
            segments.date,
            metrics.cost_micros
          FROM campaign
          WHERE segments.date BETWEEN '${options.startDate}' AND '${options.endDate}'
        `,
      }),
    },
    { tokenErrorMessage: 'Google-Ads-Token ist abgelaufen oder wurde widerrufen.' }
  )

  const totalsByDate = new Map<string, number>()

  for (const row of batches.flatMap((batch) => batch.results ?? [])) {
    const date = String(row.segments?.date ?? '').trim()
    if (!date) continue
    const cost = parseNumber(row.metrics?.costMicros) / 1_000_000
    totalsByDate.set(date, (totalsByDate.get(date) ?? 0) + cost)
  }

  return Array.from(totalsByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }))
}

// Returns daily spend broken down per campaign — used for campaign-scoped budget tracking.
async function fetchGoogleAdsCampaignDailySpend(options: {
  accessToken: string
  customerId: string
  managerCustomerId?: string
  startDate: string
  endDate: string
}): Promise<{ campaignId: string; campaignName: string; date: string; cost: number }[]> {
  const customerId = normalizeCustomerId(options.customerId)
  const managerCustomerId = normalizeCustomerId(options.managerCustomerId ?? '')
  const batches = await fetchGoogleAdsJson<GoogleAdsSearchStreamBatch[]>(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: buildGoogleAdsHeaders(options.accessToken, managerCustomerId || customerId),
      body: JSON.stringify({
        query: `
          SELECT
            campaign.id,
            campaign.name,
            segments.date,
            metrics.cost_micros
          FROM campaign
          WHERE segments.date BETWEEN '${options.startDate}' AND '${options.endDate}'
        `,
      }),
    },
    { tokenErrorMessage: 'Google-Ads-Token ist abgelaufen oder wurde widerrufen.' }
  )

  return batches
    .flatMap((batch) => batch.results ?? [])
    .map((row) => ({
      campaignId: String(row.campaign?.id ?? ''),
      campaignName: row.campaign?.name || 'Unbenannte Kampagne',
      date: String(row.segments?.date ?? '').trim(),
      cost: parseNumber(row.metrics?.costMicros) / 1_000_000,
    }))
    .filter((r) => r.date && r.campaignId)
}

export async function getGoogleAdsCampaignDailySpend(
  integration: GoogleAdsIntegrationRecord,
  credentials: GoogleAdsCredentials,
  options: { startDate: string; endDate: string }
): Promise<{ campaignId: string; campaignName: string; date: string; cost: number }[]> {
  const { accessToken, credentials: refreshed } = await getValidGoogleAdsToken(integration.id, credentials)
  const customerId = refreshed.google_ads_customer_id ?? credentials.google_ads_customer_id
  if (!customerId) return []
  return fetchGoogleAdsCampaignDailySpend({
    accessToken,
    customerId,
    managerCustomerId: refreshed.google_ads_manager_customer_id,
    startDate: options.startDate,
    endDate: options.endDate,
  })
}

function getCachedSnapshot(
  credentials: GoogleAdsCredentials,
  range: GoogleAdsDateRangeKey
): GoogleAdsDashboardData | null {
  return credentials.cached_snapshots?.[range] ?? null
}

function getCacheAgeMinutes(
  credentials: GoogleAdsCredentials,
  range: GoogleAdsDateRangeKey
): number | undefined {
  const cachedAt = credentials.cached_at_by_range?.[range]
  if (!cachedAt) return undefined
  return Math.max(0, Math.round((Date.now() - new Date(cachedAt).getTime()) / 60_000))
}

function isCacheValid(credentials: GoogleAdsCredentials, range: GoogleAdsDateRangeKey): boolean {
  const cachedAt = credentials.cached_at_by_range?.[range]
  if (!cachedAt) return false
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS
}

async function storeCachedSnapshot(
  integrationId: string,
  credentials: GoogleAdsCredentials,
  range: GoogleAdsDateRangeKey,
  data: GoogleAdsDashboardData
) {
  const nextCredentials: GoogleAdsCredentials = {
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

  await saveGoogleAdsIntegrationCredentials({
    integrationId,
    credentials: nextCredentials,
    status: 'connected',
  })
}

export async function getGoogleAdsDashboardSnapshot(
  integration: GoogleAdsIntegrationRecord,
  credentials: GoogleAdsCredentials,
  range: GoogleAdsDateRangeKey
): Promise<{ data: GoogleAdsDashboardData; trend: number | null }> {
  if (!credentials.google_ads_customer_id) {
    return {
      data: {
        campaigns: [],
        totalCost: 0,
        avgCpc: 0,
        totalConversions: 0,
        currency: credentials.currency_code,
        message: 'Es wurde noch kein Google-Ads-Account fuer diesen Kunden ausgewaehlt.',
      },
      trend: null,
    }
  }

  const { startDate, endDate, compareStartDate, compareEndDate } = getDateRange(range)

  try {
    const { accessToken, credentials: refreshedCredentials } = await getValidGoogleAdsToken(
      integration.id,
      credentials
    )

    const activeCustomerId =
      refreshedCredentials.google_ads_customer_id ?? credentials.google_ads_customer_id

    if (!activeCustomerId) {
      return {
        data: {
          campaigns: [],
          totalCost: 0,
          avgCpc: 0,
          totalConversions: 0,
          currency: refreshedCredentials.currency_code,
          message: 'Es wurde noch kein Google-Ads-Account fuer diesen Kunden ausgewaehlt.',
        },
        trend: null,
      }
    }

    const [current, previous, timeseries] = await Promise.all([
      fetchGoogleAdsCampaignSnapshot({
        accessToken,
        customerId: activeCustomerId,
        managerCustomerId: refreshedCredentials.google_ads_manager_customer_id,
        startDate,
        endDate,
        currency: refreshedCredentials.currency_code,
      }),
      fetchGoogleAdsCampaignSnapshot({
        accessToken,
        customerId: activeCustomerId,
        managerCustomerId: refreshedCredentials.google_ads_manager_customer_id,
        startDate: compareStartDate,
        endDate: compareEndDate,
        currency: refreshedCredentials.currency_code,
      }),
      fetchGoogleAdsCostTimeseries({
        accessToken,
        customerId: activeCustomerId,
        managerCustomerId: refreshedCredentials.google_ads_manager_customer_id,
        startDate,
        endDate,
      }),
    ])

    current.timeseries = timeseries

    await storeCachedSnapshot(integration.id, refreshedCredentials, range, current)

    const trend =
      previous.totalCost > 0 ? ((current.totalCost - previous.totalCost) / previous.totalCost) * 100 : null

    return { data: current, trend }
  } catch (error) {
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

    throw error
  }
}
