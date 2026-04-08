import { decryptCredentials, encryptCredentials } from '@/lib/customer-credentials-encryption'
import {
  GoogleAdsTokenRevokedError,
  refreshGoogleAdsAccessToken,
} from '@/lib/google-ads-oauth'
import { createAdminClient } from '@/lib/supabase-admin'

const GOOGLE_ADS_API_BASE = 'https://googleads.googleapis.com/v18'

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
}

export interface GoogleAdsIntegrationRecord {
  id: string
  customer_id: string
  integration_type: string
  status: string
  credentials_encrypted: string | null
}

interface AccessibleCustomersResponse {
  resourceNames?: string[]
}

interface GoogleAdsSearchStreamRow {
  customer?: {
    id?: string | number
    descriptiveName?: string
    currencyCode?: string
    manager?: boolean
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

export async function listGoogleAdsAccounts(accessToken: string): Promise<GoogleAdsAccount[]> {
  const customerIds = await getAccessibleCustomerIds(accessToken)
  const accounts = await Promise.all(
    customerIds.map((customerId) => getCustomerDetails(accessToken, customerId))
  )

  return accounts
    .filter((account): account is GoogleAdsAccount => Boolean(account))
    .sort((a, b) => a.name.localeCompare(b.name))
}
