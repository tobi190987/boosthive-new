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
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'
import { GA4TokenRevokedError } from '@/lib/ga4-oauth'

const querySchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
  range: z.enum(['today', '7d', '30d', '90d']).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`dashboard-ga4:${tenantId}:${getClientIp(request)}`, GSC_READ)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantUser(tenantId)
    if ('error' in authResult) return authResult.error

    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries())
    const parsedQuery = querySchema.safeParse(searchParams)
    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.issues[0]?.message }, { status: 400 })
    }

    const customerId = parsedQuery.data.customerId
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
      return NextResponse.json({ connected: false, revoked: true, data: null, trend: null })
    }

    const data = await getGA4DashboardSnapshot(integration, credentials, range)
    return NextResponse.json({
      connected: true,
      data,
      trend: data.trend,
    })
  } catch (error) {
    if (error instanceof GA4TokenRevokedError) {
      return NextResponse.json({ connected: false, revoked: true, data: null, trend: null })
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

    console.error('[dashboard/ga4] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GA4-Daten konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
