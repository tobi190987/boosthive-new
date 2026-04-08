import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'
import {
  getCustomerGscIntegration,
  getValidCustomerGscToken,
  listGscProperties,
  parseCustomerGscCredentials,
  saveCustomerGscIntegrationCredentials,
} from '@/lib/gsc-customer-api'
import { CustomerGscTokenRevokedError } from '@/lib/gsc-customer-oauth'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'

const paramsSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

const bodySchema = z.object({
  property: z.string().trim().min(1, 'Property ist erforderlich.').max(500),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`customer-gsc-property:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantAdmin(tenantId)
    if ('error' in authResult) return authResult.error

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
    }

    const parsedBody = bodySchema.safeParse(body)
    if (!parsedBody.success) {
      return NextResponse.json({ error: parsedBody.error.issues[0]?.message }, { status: 422 })
    }

    const { customerId } = parsedParams.data
    const admin = createAdminClient()
    const { data: customer, error: customerError } = await admin
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
    if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

    const integration = await getCustomerGscIntegration(tenantId, customerId)
    if (!integration) {
      return NextResponse.json({ error: 'Keine GSC-Verbindung für diesen Kunden.' }, { status: 404 })
    }

    const credentials = parseCustomerGscCredentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ error: 'Keine lesbaren GSC-Credentials vorhanden.' }, { status: 409 })
    }

    const { accessToken, credentials: refreshedCredentials } = await getValidCustomerGscToken(
      integration.id,
      credentials
    )
    const properties = await listGscProperties(accessToken)
    const selectedProperty = properties.find((property) => property.siteUrl === parsedBody.data.property)

    if (!selectedProperty) {
      return NextResponse.json(
        { error: 'Die ausgewählte GSC-Property ist für dieses Google-Konto nicht verfügbar.' },
        { status: 422 }
      )
    }

    await saveCustomerGscIntegrationCredentials({
      integrationId: integration.id,
      status: 'connected',
      credentials: {
        ...refreshedCredentials,
        selected_property: selectedProperty.siteUrl,
      },
    })

    return NextResponse.json({
      property: {
        siteUrl: selectedProperty.siteUrl,
        permissionLevel: selectedProperty.permissionLevel,
      },
    })
  } catch (error) {
    if (error instanceof CustomerGscTokenRevokedError) {
      return NextResponse.json(
        { error: 'GSC-Token wurde widerrufen. Bitte die Verbindung erneut herstellen.' },
        { status: 403 }
      )
    }

    if (isCredentialsDecryptError(error)) {
      return NextResponse.json(
        {
          error:
            'Die gespeicherte GSC-Verbindung kann mit dem aktuellen Verschluesselungs-Schluessel nicht gelesen werden. Bitte trenne die Verbindung und verbinde Google Search Console erneut.',
        },
        { status: 409 }
      )
    }

    console.error('[gsc-customer/select-property] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GSC-Property konnte nicht gespeichert werden.' },
      { status: 500 }
    )
  }
}
