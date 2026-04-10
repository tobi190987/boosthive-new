import { decryptCredentials, encryptCredentials } from '@/lib/customer-credentials-encryption'
import {
  CustomerGscTokenRevokedError,
  refreshCustomerGscAccessToken,
} from '@/lib/gsc-customer-oauth'
import { listGscProperties, querySearchAnalytics } from '@/lib/gsc-oauth'
import { createAdminClient } from '@/lib/supabase-admin'

const CACHE_TTL_MS = 15 * 60 * 1000

export interface CustomerGscCredentials {
  access_token: string
  refresh_token: string
  token_expiry: string
  google_email: string
  selected_property?: string
  cached_data?: CustomerGscDashboardData
  cached_at?: string
}

export interface CustomerGscIntegrationRecord {
  id: string
  customer_id: string
  integration_type: string
  status: string
  credentials_encrypted: string | null
}

export type CustomerGscDateRangeKey = 'today' | '7d' | '30d' | '90d'

export interface CustomerGscKeyword {
  keyword: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface CustomerGscDashboardData {
  impressions: number
  clicks: number
  avgCtr: number
  avgPosition: number
  topKeywords: CustomerGscKeyword[]
  timeseries?: { label: string; value: number }[]
  isCached?: boolean
  cacheAgeMinutes?: number
  googleEmail?: string
  property?: string
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getDateRange(range: CustomerGscDateRangeKey) {
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

function getCacheAgeMinutes(cachedAt: string | undefined): number | undefined {
  if (!cachedAt) return undefined
  return Math.max(0, Math.round((Date.now() - new Date(cachedAt).getTime()) / 60_000))
}

function isCacheValid(cachedAt: string | undefined): boolean {
  if (!cachedAt) return false
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS
}

export function parseCustomerGscCredentials(encrypted: string | null): CustomerGscCredentials | null {
  if (!encrypted) return null
  return decryptCredentials(encrypted) as CustomerGscCredentials
}

export async function getCustomerGscIntegration(
  _tenantId: string,
  customerId: string
): Promise<CustomerGscIntegrationRecord | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customer_integrations')
    .select('id, customer_id, integration_type, status, credentials_encrypted')
    .eq('customer_id', customerId)
    .eq('integration_type', 'gsc')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as CustomerGscIntegrationRecord | null) ?? null
}

export async function saveCustomerGscIntegrationCredentials(options: {
  integrationId: string
  credentials: CustomerGscCredentials
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

export async function upsertCustomerGscConnection(options: {
  customerId: string
  userId: string
  googleEmail: string
  accessToken: string
  refreshToken: string
  tokenExpiry: string
}) {
  const admin = createAdminClient()
  const existing = await getCustomerGscIntegration('', options.customerId)
  const existingCredentials = parseCustomerGscCredentials(existing?.credentials_encrypted ?? null)

  const nextCredentials: CustomerGscCredentials = {
    access_token: options.accessToken,
    refresh_token: options.refreshToken,
    token_expiry: options.tokenExpiry,
    google_email: options.googleEmail,
    selected_property: existingCredentials?.selected_property,
    cached_data: existingCredentials?.cached_data,
    cached_at: existingCredentials?.cached_at,
  }

  const { data, error } = await admin
    .from('customer_integrations')
    .upsert(
      {
        customer_id: options.customerId,
        integration_type: 'gsc',
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

export async function disconnectCustomerGscIntegration(integrationId: string) {
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

export async function getValidCustomerGscToken(
  integrationId: string,
  credentials: CustomerGscCredentials
): Promise<{ accessToken: string; credentials: CustomerGscCredentials }> {
  const expiryDate = new Date(credentials.token_expiry)

  if (expiryDate.getTime() - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed = await refreshCustomerGscAccessToken(credentials.refresh_token)
      const nextCredentials: CustomerGscCredentials = {
        ...credentials,
        access_token: refreshed.access_token,
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }

      await saveCustomerGscIntegrationCredentials({
        integrationId,
        credentials: nextCredentials,
        status: 'connected',
      })

      return { accessToken: refreshed.access_token, credentials: nextCredentials }
    } catch (error) {
      if (error instanceof CustomerGscTokenRevokedError) {
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

export { listGscProperties }

async function fetchCustomerGscSnapshot(options: {
  accessToken: string
  property: string
  startDate: string
  endDate: string
  googleEmail?: string
}): Promise<CustomerGscDashboardData> {
  const [summaryRows, keywordRows] = await Promise.all([
    querySearchAnalytics(options.accessToken, {
      siteUrl: options.property,
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: ['date'],
      rowLimit: 250,
    }),
    querySearchAnalytics(options.accessToken, {
      siteUrl: options.property,
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: ['query'],
      rowLimit: 10,
    }),
  ])

  const clicks = summaryRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0)
  const impressions = summaryRows.reduce((sum, row) => sum + (row.impressions ?? 0), 0)
  const avgCtr = impressions > 0 ? (clicks / impressions) * 100 : 0
  const avgPosition =
    summaryRows.length > 0
      ? summaryRows.reduce((sum, row) => sum + (row.position ?? 0), 0) / summaryRows.length
      : 0

  const timeseries = summaryRows
    .filter((row) => row.keys?.[0])
    .sort((a, b) => (a.keys?.[0] ?? '').localeCompare(b.keys?.[0] ?? ''))
    .map((row) => {
      const dateStr = row.keys?.[0] ?? ''
      // YYYY-MM-DD → DD.MM.
      const label =
        dateStr.length === 10
          ? `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}.`
          : dateStr
      return { label, value: row.impressions ?? 0 }
    })

  return {
    impressions,
    clicks,
    avgCtr,
    avgPosition,
    timeseries,
    topKeywords: keywordRows.map((row) => ({
      keyword: row.keys?.[0] ?? 'Unbekannt',
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: (row.ctr ?? 0) * 100,
      position: row.position ?? 0,
    })),
    googleEmail: options.googleEmail,
    property: options.property,
  }
}

export async function getCustomerGscDashboardSnapshot(
  integration: CustomerGscIntegrationRecord,
  credentials: CustomerGscCredentials,
  range: CustomerGscDateRangeKey
): Promise<{ data: CustomerGscDashboardData; trend: number | null }> {
  if (!credentials.selected_property) {
    return {
      data: {
        impressions: 0,
        clicks: 0,
        avgCtr: 0,
        avgPosition: 0,
        topKeywords: [],
        googleEmail: credentials.google_email,
      },
      trend: null,
    }
  }

  const { startDate, endDate, compareStartDate, compareEndDate } = getDateRange(range)

  try {
    const { accessToken, credentials: refreshedCredentials } = await getValidCustomerGscToken(
      integration.id,
      credentials
    )

    const property = refreshedCredentials.selected_property ?? credentials.selected_property
    if (!property) {
      return {
        data: {
          impressions: 0,
          clicks: 0,
          avgCtr: 0,
          avgPosition: 0,
          topKeywords: [],
          googleEmail: refreshedCredentials.google_email,
        },
        trend: null,
      }
    }

    const [current, previous] = await Promise.all([
      fetchCustomerGscSnapshot({
        accessToken,
        property,
        startDate,
        endDate,
        googleEmail: refreshedCredentials.google_email,
      }),
      fetchCustomerGscSnapshot({
        accessToken,
        property,
        startDate: compareStartDate,
        endDate: compareEndDate,
        googleEmail: refreshedCredentials.google_email,
      }),
    ])

    await saveCustomerGscIntegrationCredentials({
      integrationId: integration.id,
      status: 'connected',
      credentials: {
        ...refreshedCredentials,
        cached_data: current,
        cached_at: new Date().toISOString(),
      },
    })

    const trend =
      previous.clicks > 0 ? ((current.clicks - previous.clicks) / previous.clicks) * 100 : null

    return { data: current, trend }
  } catch (error) {
    if (credentials.cached_data && isCacheValid(credentials.cached_at)) {
      return {
        data: {
          ...credentials.cached_data,
          isCached: true,
          cacheAgeMinutes: getCacheAgeMinutes(credentials.cached_at),
        },
        trend: null,
      }
    }

    throw error
  }
}
