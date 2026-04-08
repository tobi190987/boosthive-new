import { decryptCredentials, encryptCredentials } from '@/lib/customer-credentials-encryption'
import {
  CustomerGscTokenRevokedError,
  refreshCustomerGscAccessToken,
} from '@/lib/gsc-customer-oauth'
import { listGscProperties } from '@/lib/gsc-oauth'
import { createAdminClient } from '@/lib/supabase-admin'

export interface CustomerGscCredentials {
  access_token: string
  refresh_token: string
  token_expiry: string
  google_email: string
  selected_property?: string
}

export interface CustomerGscIntegrationRecord {
  id: string
  customer_id: string
  integration_type: string
  status: string
  credentials_encrypted: string | null
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
