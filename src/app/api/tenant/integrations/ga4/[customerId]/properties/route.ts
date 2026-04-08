import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import {
  getGA4Integration,
  getValidGA4Token,
  listGA4Properties,
  parseGA4Credentials,
} from '@/lib/ga4-api'
import { GA4TokenRevokedError } from '@/lib/ga4-oauth'
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

    const rl = checkRateLimit(`ga4-properties:${tenantId}:${getClientIp(request)}`, GSC_READ)
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

    const integration = await getGA4Integration(tenantId, customerId)
    if (!integration) {
      return NextResponse.json({ error: 'Keine GA4-Verbindung für diesen Kunden.' }, { status: 404 })
    }

    const credentials = parseGA4Credentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ error: 'Keine lesbaren GA4-Credentials vorhanden.' }, { status: 409 })
    }

    const { accessToken } = await getValidGA4Token(integration.id, credentials)
    const properties = await listGA4Properties(accessToken)

    return NextResponse.json({
      properties: properties.map((property) => ({
        propertyId: property.propertyId,
        displayName: property.displayName,
        name: property.name,
      })),
    })
  } catch (error) {
    if (error instanceof GA4TokenRevokedError) {
      return NextResponse.json(
        { error: 'GA4-Token wurde widerrufen. Bitte die Verbindung erneut herstellen.' },
        { status: 403 }
      )
    }

    if (isCredentialsDecryptError(error)) {
      return NextResponse.json(
        {
          error:
            'Die gespeicherte GA4-Verbindung kann mit dem aktuellen Verschluesselungs-Schluessel nicht gelesen werden. Bitte trenne die Verbindung und verbinde Google Analytics erneut.',
        },
        { status: 409 }
      )
    }

    console.error('[ga4/properties] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GA4-Properties konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
