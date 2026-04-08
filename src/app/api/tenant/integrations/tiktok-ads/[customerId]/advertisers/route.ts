import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import {
  getTikTokAdsIntegration,
  TikTokAdsContractError,
  getValidTikTokAdsToken,
  listTikTokAdvertisers,
  parseTikTokAdsCredentials,
} from '@/lib/tiktok-ads-api'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'
import { TikTokAdsTokenExpiredError } from '@/lib/tiktok-ads-oauth'

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

    const rl = checkRateLimit(`tiktok-ads-advertisers:${tenantId}:${getClientIp(request)}`, GSC_READ)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantAdmin(tenantId)
    if ('error' in authResult) return authResult.error

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: customer, error: customerError } = await admin
      .from('customers')
      .select('id')
      .eq('id', parsedParams.data.customerId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
    if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

    const integration = await getTikTokAdsIntegration(tenantId, parsedParams.data.customerId)
    if (!integration) {
      return NextResponse.json({ error: 'Keine TikTok-Verbindung für diesen Kunden.' }, { status: 404 })
    }

    const credentials = parseTikTokAdsCredentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ error: 'Keine lesbaren TikTok-Credentials vorhanden.' }, { status: 409 })
    }

    const { accessToken } = await getValidTikTokAdsToken(integration.id, credentials)
    const advertisers = await listTikTokAdvertisers(accessToken)
    return NextResponse.json({ advertisers })
  } catch (error) {
    if (error instanceof TikTokAdsTokenExpiredError) {
      return NextResponse.json(
        { error: 'TikTok-Token wurde widerrufen oder ist abgelaufen. Bitte erneut verbinden.' },
        { status: 403 }
      )
    }

    if (isCredentialsDecryptError(error)) {
      return NextResponse.json(
        {
          error:
            'Die gespeicherte TikTok-Verbindung kann mit dem aktuellen Verschluesselungs-Schluessel nicht gelesen werden. Bitte trenne die Verbindung und verbinde TikTok Ads erneut.',
        },
        { status: 409 }
      )
    }

    if (error instanceof TikTokAdsContractError) {
      return NextResponse.json(
        {
          error:
            'Die TikTok API liefert ein unerwartetes Advertiser-Format. Bitte API-Version und Mapping pruefen.',
        },
        { status: 502 }
      )
    }

    console.error('[tiktok-ads/advertisers] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TikTok-Advertiser konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
