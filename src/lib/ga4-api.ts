/**
 * PROJ-50: Google Analytics 4 Data API helpers.
 */

import { decryptCredentials, encryptCredentials } from '@/lib/customer-credentials-encryption'
import { GA4TokenRevokedError, refreshGA4AccessToken } from '@/lib/ga4-oauth'
import { createAdminClient } from '@/lib/supabase-admin'

const GA4_ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const GA4_DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const CACHE_TTL_MS = 15 * 60 * 1000

export interface GA4Property {
  name: string
  displayName: string
  propertyId: string
}

export interface GA4MetricsResult {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
  timeseries: { label: string; value: number }[]
  trend: number | null
}

export interface GA4DashboardData extends GA4MetricsResult {
  isCached?: boolean
  cacheAgeMinutes?: number
  googleEmail?: string
  propertyName?: string
  propertyId?: string
  message?: string
}

export interface GA4Credentials {
  access_token: string
  refresh_token: string
  token_expiry: string
  google_email: string
  ga4_property_id?: string
  ga4_property_name?: string
  cached_data?: string
  cached_at?: string
}

export interface GA4IntegrationRecord {
  id: string
  customer_id: string
  integration_type: string
  status: string
  credentials_encrypted: string | null
}

class GoogleApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export type DateRangeKey = 'today' | '7d' | '30d' | '90d'

export function getDateRange(range: DateRangeKey): {
  startDate: string
  endDate: string
  compareStartDate: string
  compareEndDate: string
} {
  const now = new Date()
  const endDate = formatDate(now)

  let daysBack: number
  switch (range) {
    case 'today':
      daysBack = 0
      break
    case '7d':
      daysBack = 6
      break
    case '30d':
      daysBack = 29
      break
    case '90d':
      daysBack = 89
      break
    default:
      daysBack = 29
  }

  const startDateObj = new Date(now)
  startDateObj.setDate(startDateObj.getDate() - daysBack)
  const startDate = formatDate(startDateObj)

  const periodLength = daysBack + 1
  const compareEndObj = new Date(startDateObj)
  compareEndObj.setDate(compareEndObj.getDate() - 1)
  const compareEndDate = formatDate(compareEndObj)

  const compareStartObj = new Date(compareEndObj)
  compareStartObj.setDate(compareStartObj.getDate() - (periodLength - 1))
  const compareStartDate = formatDate(compareStartObj)

  return { startDate, endDate, compareStartDate, compareEndDate }
}

export function isCacheValid(cachedAt: string | undefined): boolean {
  if (!cachedAt) return false
  const cachedTime = new Date(cachedAt).getTime()
  return Date.now() - cachedTime < CACHE_TTL_MS
}

export function getCacheAgeMinutes(cachedAt: string | undefined): number | null {
  if (!cachedAt) return null
  return Math.max(0, Math.round((Date.now() - new Date(cachedAt).getTime()) / 60_000))
}

export function parseGA4Credentials(encrypted: string | null): GA4Credentials | null {
  if (!encrypted) return null
  return decryptCredentials(encrypted) as GA4Credentials
}

export async function getGA4Integration(
  _tenantId: string,
  customerId: string
): Promise<GA4IntegrationRecord | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('customer_integrations')
    .select('id, customer_id, integration_type, status, credentials_encrypted')
    .eq('customer_id', customerId)
    .eq('integration_type', 'ga4')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as GA4IntegrationRecord | null) ?? null
}

export async function saveGA4IntegrationCredentials(options: {
  integrationId: string
  credentials: GA4Credentials
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

export async function upsertGA4Connection(options: {
  tenantId: string
  customerId: string
  userId: string
  googleEmail: string
  accessToken: string
  refreshToken: string
  tokenExpiry: string
}) {
  const admin = createAdminClient()
  const nextCredentials: GA4Credentials = {
    access_token: options.accessToken,
    refresh_token: options.refreshToken,
    token_expiry: options.tokenExpiry,
    google_email: options.googleEmail,
  }

  const { data, error } = await admin
    .from('customer_integrations')
    .upsert(
      {
        customer_id: options.customerId,
        integration_type: 'ga4',
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

export async function disconnectGA4Integration(integrationId: string) {
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

export async function getValidGA4Token(
  integrationId: string,
  credentials: GA4Credentials
): Promise<{ accessToken: string; credentials: GA4Credentials }> {
  const expiryDate = new Date(credentials.token_expiry)

  if (expiryDate.getTime() - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed = await refreshGA4AccessToken(credentials.refresh_token)
      const nextCredentials: GA4Credentials = {
        ...credentials,
        access_token: refreshed.access_token,
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }

      await saveGA4IntegrationCredentials({
        integrationId,
        credentials: nextCredentials,
        status: 'connected',
      })

      return { accessToken: refreshed.access_token, credentials: nextCredentials }
    } catch (error) {
      if (error instanceof GA4TokenRevokedError) {
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

export async function listGA4Properties(accessToken: string): Promise<GA4Property[]> {
  try {
    const properties = await listGA4PropertiesFromAccountSummaries(accessToken)
    if (properties.length > 0) return properties
  } catch (error) {
    if (error instanceof GA4TokenRevokedError) throw error
    if (!(error instanceof GoogleApiError) || error.status !== 403) {
      throw error
    }
  }

  return listGA4PropertiesFromAccounts(accessToken)
}

async function listGA4PropertiesFromAccountSummaries(accessToken: string): Promise<GA4Property[]> {
  const properties = new Map<string, GA4Property>()
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: '200' })
    if (pageToken) params.set('pageToken', pageToken)

    const summariesRes = await fetch(`${GA4_ADMIN_API}/accountSummaries?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!summariesRes.ok) {
      throw await createGoogleApiError(summariesRes, 'GA4 Account-Summaries-Abfrage fehlgeschlagen')
    }

    const summariesData = (await summariesRes.json()) as {
      accountSummaries?: {
        propertySummaries?: { property?: string; displayName?: string }[]
      }[]
      nextPageToken?: string
    }

    for (const summary of summariesData.accountSummaries ?? []) {
      for (const property of summary.propertySummaries ?? []) {
        if (!property.property) continue

        const propertyId = property.property.replace('properties/', '')
        properties.set(propertyId, {
          name: property.property,
          displayName: property.displayName ?? propertyId,
          propertyId,
        })
      }
    }

    pageToken = summariesData.nextPageToken || undefined
  } while (pageToken)

  return Array.from(properties.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

async function listGA4PropertiesFromAccounts(accessToken: string): Promise<GA4Property[]> {
  const properties = new Map<string, GA4Property>()
  let accountsPageToken: string | undefined

  do {
    const accountsParams = new URLSearchParams({ pageSize: '200' })
    if (accountsPageToken) accountsParams.set('pageToken', accountsPageToken)

    const accountsRes = await fetch(`${GA4_ADMIN_API}/accounts?${accountsParams.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!accountsRes.ok) {
      throw await createGoogleApiError(accountsRes, 'GA4 Accounts-Abfrage fehlgeschlagen')
    }

    const accountsData = (await accountsRes.json()) as {
      accounts?: { name: string }[]
      nextPageToken?: string
    }

    for (const account of accountsData.accounts ?? []) {
      let propertiesPageToken: string | undefined

      do {
        const propertiesParams = new URLSearchParams({
          filter: `parent:${account.name}`,
          pageSize: '200',
        })
        if (propertiesPageToken) propertiesParams.set('pageToken', propertiesPageToken)

        const propsRes = await fetch(`${GA4_ADMIN_API}/properties?${propertiesParams.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!propsRes.ok) {
          throw await createGoogleApiError(propsRes, 'GA4 Properties-Abfrage fehlgeschlagen')
        }

        const propsData = (await propsRes.json()) as {
          properties?: { name: string; displayName: string }[]
          nextPageToken?: string
        }

        for (const prop of propsData.properties ?? []) {
          const propertyId = prop.name.replace('properties/', '')
          properties.set(propertyId, {
            name: prop.name,
            displayName: prop.displayName,
            propertyId,
          })
        }

        propertiesPageToken = propsData.nextPageToken || undefined
      } while (propertiesPageToken)
    }

    accountsPageToken = accountsData.nextPageToken || undefined
  } while (accountsPageToken)

  return Array.from(properties.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

async function createGoogleApiError(response: Response, prefix: string): Promise<Error> {
  if (response.status === 401) {
    return new GA4TokenRevokedError('GA4 Access-Token abgelaufen oder widerrufen.')
  }

  const errorText = await response.text().catch(() => '')
  const detail = extractGoogleApiErrorMessage(errorText)
  return new GoogleApiError(
    response.status,
    detail ? `${prefix}: ${response.status} ${detail}` : `${prefix}: ${response.status}`
  )
}

function extractGoogleApiErrorMessage(errorText: string): string {
  if (!errorText) return ''

  try {
    const parsed = JSON.parse(errorText) as {
      error?: { message?: unknown; status?: unknown }
    }
    const message = typeof parsed.error?.message === 'string' ? parsed.error.message : ''
    const status = typeof parsed.error?.status === 'string' ? parsed.error.status : ''
    return [message, status].filter(Boolean).join(' ')
  } catch {
    return errorText
  }
}

export async function fetchGA4Metrics(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  compareStartDate: string,
  compareEndDate: string
): Promise<GA4MetricsResult> {
  const metricsBody = {
    dateRanges: [
      { startDate, endDate },
      { startDate: compareStartDate, endDate: compareEndDate },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
  }

  const metricsRes = await fetch(`${GA4_DATA_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metricsBody),
  })

  if (!metricsRes.ok) {
    if (metricsRes.status === 401) {
      throw new GA4TokenRevokedError('GA4 Access-Token abgelaufen oder widerrufen.')
    }
    if (metricsRes.status === 429) {
      throw new GA4RateLimitError('GA4 API Rate Limit erreicht.')
    }
    const errorText = await metricsRes.text().catch(() => '')
    throw new Error(`GA4 Metrics-Abfrage fehlgeschlagen: ${metricsRes.status} ${errorText}`)
  }

  const metricsData = (await metricsRes.json()) as {
    rows?: { metricValues?: { value: string }[] }[]
  }

  const currentRow = metricsData.rows?.[0]?.metricValues ?? []
  const previousRow = metricsData.rows?.[1]?.metricValues ?? []

  const sessions = parseFloat(currentRow[0]?.value ?? '0')
  const users = parseFloat(currentRow[1]?.value ?? '0')
  const pageviews = parseFloat(currentRow[2]?.value ?? '0')
  const bounceRate = parseFloat(currentRow[3]?.value ?? '0') * 100
  const avgSessionDuration = parseFloat(currentRow[4]?.value ?? '0')
  const previousSessions = parseFloat(previousRow[0]?.value ?? '0')
  const trend = previousSessions > 0 ? ((sessions - previousSessions) / previousSessions) * 100 : null

  const timeseriesRes = await fetch(`${GA4_DATA_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
    }),
  })

  let timeseries: { label: string; value: number }[] = []

  if (timeseriesRes.ok) {
    const tsData = (await timeseriesRes.json()) as {
      rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[]
    }

    timeseries = (tsData.rows ?? []).map((row) => {
      const dateStr = row.dimensionValues?.[0]?.value ?? ''
      const formatted =
        dateStr.length === 8 ? `${dateStr.slice(6, 8)}.${dateStr.slice(4, 6)}.` : dateStr

      return {
        label: formatted,
        value: parseFloat(row.metricValues?.[0]?.value ?? '0'),
      }
    })
  }

  return {
    sessions,
    users,
    pageviews,
    bounceRate,
    avgSessionDuration,
    timeseries,
    trend,
  }
}

export function withGA4Meta(
  metrics: GA4MetricsResult,
  credentials: GA4Credentials,
  extras?: Partial<GA4DashboardData>
): GA4DashboardData {
  return {
    ...metrics,
    googleEmail: credentials.google_email,
    propertyName: credentials.ga4_property_name,
    propertyId: credentials.ga4_property_id,
    ...extras,
  }
}

export function parseCachedGA4Data(credentials: GA4Credentials): GA4DashboardData | null {
  if (!credentials.cached_data) return null

  try {
    return JSON.parse(credentials.cached_data) as GA4DashboardData
  } catch {
    return null
  }
}

export async function storeCachedGA4Data(
  integrationId: string,
  credentials: GA4Credentials,
  data: GA4DashboardData
) {
  const nextCredentials: GA4Credentials = {
    ...credentials,
    cached_data: JSON.stringify(data),
    cached_at: new Date().toISOString(),
  }

  await saveGA4IntegrationCredentials({
    integrationId,
    credentials: nextCredentials,
    status: 'connected',
  })

  return nextCredentials
}

export function createEmptyGA4DashboardData(
  credentials: GA4Credentials,
  message?: string
): GA4DashboardData {
  return {
    sessions: 0,
    users: 0,
    pageviews: 0,
    bounceRate: 0,
    avgSessionDuration: 0,
    timeseries: [],
    trend: null,
    googleEmail: credentials.google_email,
    propertyName: credentials.ga4_property_name,
    propertyId: credentials.ga4_property_id,
    message,
  }
}

export async function getGA4DashboardSnapshot(
  integration: GA4IntegrationRecord,
  credentials: GA4Credentials,
  range: DateRangeKey
): Promise<GA4DashboardData> {
  if (!credentials.ga4_property_id) {
    return createEmptyGA4DashboardData(
      credentials,
      'Es wurde noch keine GA4-Property fuer diesen Kunden ausgewaehlt.'
    )
  }

  const { startDate, endDate, compareStartDate, compareEndDate } = getDateRange(range)

  try {
    const { accessToken, credentials: refreshedCredentials } = await getValidGA4Token(
      integration.id,
      credentials
    )
    const metrics = await fetchGA4Metrics(
      accessToken,
      refreshedCredentials.ga4_property_id!,
      startDate,
      endDate,
      compareStartDate,
      compareEndDate
    )

    const data = withGA4Meta(metrics, refreshedCredentials)
    await storeCachedGA4Data(integration.id, refreshedCredentials, data)
    return data
  } catch (error) {
    if (error instanceof GA4RateLimitError) {
      const cached = parseCachedGA4Data(credentials)
      if (cached && isCacheValid(credentials.cached_at)) {
        return {
          ...cached,
          googleEmail: credentials.google_email,
          propertyName: credentials.ga4_property_name,
          propertyId: credentials.ga4_property_id,
          isCached: true,
          cacheAgeMinutes: getCacheAgeMinutes(credentials.cached_at) ?? undefined,
        }
      }
    }

    throw error
  }
}

export class GA4RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GA4RateLimitError'
  }
}
