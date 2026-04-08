import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import {
  getCustomerGscIntegration,
  getValidCustomerGscToken,
  listGscProperties,
  parseCustomerGscCredentials,
} from '@/lib/gsc-customer-api'
import { CustomerGscTokenRevokedError } from '@/lib/gsc-customer-oauth'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'

const paramsSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`customer-gsc-properties:${tenantId}:${getClientIp(request)}`, GSC_READ)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantAdmin(tenantId)
    if ('error' in authResult) return authResult.error

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
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

    const { accessToken } = await getValidCustomerGscToken(integration.id, credentials)
    const properties = await listGscProperties(accessToken)

    return NextResponse.json({
      properties: properties.map((property) => ({
        siteUrl: property.siteUrl,
        permissionLevel: property.permissionLevel,
      })),
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

    console.error('[gsc-customer/properties] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GSC-Properties konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
