import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { tenantDelete, tenantGet } from './helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type TestSessions,
} from './helpers/fixtures'

type SupabaseAdmin = SupabaseClient<any, 'public', any>

test.describe('meta ads integration api', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions
  let admin: SupabaseAdmin
  let customerId: string
  let integrationId: string

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120_000)
    sessions = await setupTestSessions(request)
    admin = createAdminClientForTests()

    customerId = await seedCustomer(admin, sessions)
    integrationId = await seedMetaAdsIntegration(admin, sessions, customerId)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('Member sieht im Dashboard connected=false, solange die Verbindung unvollständig ist', async ({
    request,
  }) => {
    const response = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/dashboard/meta-ads?customerId=${customerId}&range=30d`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )

    expect(response.status()).toBe(200)

    const payload = await response.json()
    expect(payload.connected).toBe(false)
    expect(payload.data).toBeNull()
    expect(payload.trend).toBeNull()
  })

  test('Member darf die Admin-Detailroute fuer Meta Ads nicht aufrufen', async ({ request }) => {
    const response = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/integrations/meta-ads/${customerId}?range=30d`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )

    expect(response.status()).toBe(403)
  })

  test('Admin kann eine bestehende Meta-Ads-Verbindung trennen', async ({ request }) => {
    const response = await tenantDelete(
      request,
      sessions.tenantASeed.tenant.slug,
      `/api/tenant/integrations/meta-ads/${customerId}`,
      sessions.tenantASeed.tenant.id,
      sessions.tenantAAdminCookies
    )

    expect(response.status()).toBe(200)

    const { data, error } = await admin
      .from('customer_integrations')
      .select('status, credentials_encrypted, last_activity')
      .eq('id', integrationId)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.status).toBe('disconnected')
    expect(data?.credentials_encrypted).toBeNull()
    expect(data?.last_activity).toBeNull()
  })
})

function createAdminClientForTests() {
  const env = loadEnvLocalFallback()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  const credentialsKey =
    process.env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY ??
    env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseUrl) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && serviceRoleKey) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
  }
  if (!process.env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY && credentialsKey) {
    process.env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY = credentialsKey
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase Test-Umgebungsvariablen fehlen.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function loadEnvLocalFallback() {
  try {
    const content = readFileSync('.env.local', 'utf8')
    const values: Record<string, string> = {}

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
      values[key] = value
    }

    return values
  } catch {
    return {}
  }
}

async function seedCustomer(admin: SupabaseAdmin, sessions: TestSessions) {
  const { data, error } = await admin
    .from('customers')
    .insert({
      tenant_id: sessions.tenantASeed.tenant.id,
      name: 'Meta Ads QA Kunde',
      domain: `https://meta-qa-${Date.now()}.example`,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Kunde für Meta-Ads-QA konnte nicht erstellt werden.')
  }

  return data.id as string
}

async function seedMetaAdsIntegration(
  admin: SupabaseAdmin,
  sessions: TestSessions,
  customerId: string
) {
  const { data, error } = await admin
    .from('customer_integrations')
    .insert({
      customer_id: customerId,
      integration_type: 'meta_ads',
      status: 'connected',
      credentials_encrypted: null,
      last_activity: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(
      error?.message ??
        'Meta-Ads-Integration für QA konnte nicht vorbereitet werden. Ist die Migration 040 bereits angewendet?'
    )
  }

  return data.id as string
}
