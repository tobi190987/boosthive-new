import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  getGoogleAdsDashboardSnapshot,
  getGoogleAdsIntegration,
  parseGoogleAdsCredentials,
  type GoogleAdsDateRangeKey,
} from '@/lib/google-ads-api'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'
import { GoogleAdsTokenRevokedError } from '@/lib/google-ads-oauth'

const querySchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
  range: z.enum(['today', '7d', '30d', '90d']).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`dashboard-google-ads:${tenantId}:${getClientIp(request)}`, GSC_READ)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantUser(tenantId)
    if ('error' in authResult) return authResult.error

    const parsedQuery = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    )
    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.issues[0]?.message }, { status: 400 })
    }

    const customerId = parsedQuery.data.customerId
    const range = (parsedQuery.data.range ?? '30d') as GoogleAdsDateRangeKey
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

    const integration = await getGoogleAdsIntegration(tenantId, customerId)
    if (!integration || integration.status === 'disconnected') {
      return NextResponse.json({ connected: false, data: null, trend: null })
    }

    const credentials = parseGoogleAdsCredentials(integration.credentials_encrypted)
    if (!credentials || !credentials.google_ads_customer_id) {
      return NextResponse.json({ connected: false, data: null, trend: null })
    }

    if (integration.status === 'token_expired') {
      return NextResponse.json(
        {
          error:
            'Die Google-Ads-Verbindung ist abgelaufen. Bitte in der Kundenverwaltung erneut verbinden.',
        },
        { status: 403 }
      )
    }

    const snapshot = await getGoogleAdsDashboardSnapshot(integration, credentials, range)
    return NextResponse.json({
      connected: true,
      data: snapshot.data,
      trend: snapshot.trend,
    })
  } catch (error) {
    if (error instanceof GoogleAdsTokenRevokedError) {
      return NextResponse.json(
        {
          error:
            'Die Google-Ads-Verbindung wurde widerrufen oder ist abgelaufen. Bitte erneut verbinden.',
        },
        { status: 403 }
      )
    }

    if (isCredentialsDecryptError(error)) {
      return NextResponse.json(
        {
          error:
            'Die gespeicherte Google-Ads-Verbindung kann mit dem aktuellen Verschluesselungs-Schluessel nicht gelesen werden. Bitte trenne die Verbindung und verbinde Google Ads erneut.',
        },
        { status: 409 }
      )
    }

    console.error('[dashboard/google-ads] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Google-Ads-Daten konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
