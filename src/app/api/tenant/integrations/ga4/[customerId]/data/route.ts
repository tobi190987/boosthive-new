import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  DateRangeKey,
  getGA4DashboardSnapshot,
  getGA4Integration,
  parseGA4Credentials,
} from '@/lib/ga4-api'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import { GA4TokenRevokedError } from '@/lib/ga4-oauth'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'

const paramsSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

const querySchema = z.object({
  range: z.enum(['today', '7d', '30d', '90d']).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`ga4-data:${tenantId}:${getClientIp(request)}`, GSC_READ)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantUser(tenantId)
    if ('error' in authResult) return authResult.error

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
    }

    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries())
    const parsedQuery = querySchema.safeParse(searchParams)
    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.issues[0]?.message }, { status: 400 })
    }

    const customerId = parsedParams.data.customerId
    const range = (parsedQuery.data.range ?? '30d') as DateRangeKey
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
    if (!integration || integration.status === 'disconnected') {
      return NextResponse.json({ connected: false, data: null, trend: null })
    }

    const credentials = parseGA4Credentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ connected: false, data: null, trend: null })
    }

    if (integration.status === 'token_expired') {
      return NextResponse.json(
        { error: 'Die GA4-Verbindung ist abgelaufen. Bitte in der Kundenverwaltung erneut verbinden.' },
        { status: 403 }
      )
    }

    const data = await getGA4DashboardSnapshot(integration, credentials, range)
    return NextResponse.json({
      connected: true,
      data,
      trend: data.trend,
    })
  } catch (error) {
    if (error instanceof GA4TokenRevokedError) {
      return NextResponse.json(
        { error: 'Die GA4-Verbindung wurde widerrufen. Bitte in der Kundenverwaltung erneut verbinden.' },
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

    console.error('[ga4/data] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GA4-Daten konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
