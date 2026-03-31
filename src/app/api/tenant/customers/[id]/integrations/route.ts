import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser, requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { encryptCredentials, decryptCredentials, isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const updateIntegrationsSchema = z.object({
  integrations: z.record(z.string(), z.string().max(500)),
})

const integrationTypes = ['google_ads', 'meta_pixel', 'openai', 'gsc'] as const

interface IntegrationWithCredentials {
  id: string
  integration_type: string
  status: string
  last_activity: string | null
  created_at: string
  updated_at: string
  credentials?: Record<string, any>
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-read:${tenantId}:${getClientIp(request)}`, CUSTOMERS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const admin = createAdminClient()

  // First verify customer exists and belongs to tenant
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('customer_integrations')
    .select(`
      id,
      integration_type,
      status,
      last_activity,
      created_at,
      updated_at
    `)
    .eq('customer_id', id)
    .order('integration_type', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // For admins, include decrypted credentials. For regular users, exclude credentials
  const isAdmin = authResult.auth.userId ? true : false // Simplified admin check for now
  let integrations: IntegrationWithCredentials[] = data || []

  if (isAdmin && data) {
    // Decrypt credentials for admin users
    integrations = await Promise.all(data.map(async (integration): Promise<IntegrationWithCredentials> => {
      const result: IntegrationWithCredentials = { ...integration }
      
      // Get encrypted credentials from a separate query to avoid exposing them in regular queries
      const { data: credData } = await admin
        .from('customer_integrations')
        .select('credentials_encrypted')
        .eq('id', integration.id)
        .single()
      
      if (credData?.credentials_encrypted) {
        try {
          const decrypted = decryptCredentials(credData.credentials_encrypted)
          result.credentials = decrypted
        } catch (error) {
          console.error('Failed to decrypt credentials:', error)
          result.credentials = undefined
        }
      }
      
      return result
    }))
  }

  return NextResponse.json({ integrations })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateIntegrationsSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  // First verify customer exists and belongs to tenant
  const admin = createAdminClient()
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const { integrations: integrationUpdates } = parsed.data
  const results = []

  // Process each integration
  for (const [integrationType, credentials] of Object.entries(integrationUpdates)) {
    // Validate integration type
    if (!integrationTypes.includes(integrationType as any)) {
      return NextResponse.json({ 
        error: `Ungültiger Integrationstyp: ${integrationType}. Erlaubt: ${integrationTypes.join(', ')}` 
      }, { status: 400 })
    }

    // Filter out empty credentials
    const filteredCredentials = Object.fromEntries(
      Object.entries(credentials as unknown as Record<string, string>).filter(([_, value]) => value && value.trim() !== '')
    )

    const hasCredentials = Object.keys(filteredCredentials).length > 0
    const status = hasCredentials ? 'connected' : 'disconnected'

    // Encrypt credentials
    let credentialsEncrypted = null
    if (hasCredentials) {
      try {
        credentialsEncrypted = encryptCredentials(filteredCredentials)
      } catch (error) {
        console.error('Failed to encrypt credentials:', error)
        return NextResponse.json({ error: 'Fehler bei der Verschlüsselung der Credentials.' }, { status: 500 })
      }
    }

    // Upsert integration
    const { data, error } = await admin
      .from('customer_integrations')
      .upsert({
        customer_id: id,
        integration_type: integrationType,
        status,
        credentials_encrypted: credentialsEncrypted,
        last_activity: hasCredentials ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'customer_id,integration_type',
        ignoreDuplicates: false
      })
      .select(`
        id,
        integration_type,
        status,
        last_activity,
        created_at,
        updated_at
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    results.push(data)
  }

  return NextResponse.json({ integrations: results })
}
