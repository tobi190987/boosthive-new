import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'
import {
  getTikTokAdsIntegration,
  TikTokAdsContractError,
  getValidTikTokAdsToken,
  listTikTokAdvertisers,
  parseTikTokAdsCredentials,
  saveTikTokAdsIntegrationCredentials,
} from '@/lib/tiktok-ads-api'
import { TikTokAdsTokenExpiredError } from '@/lib/tiktok-ads-oauth'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'

const paramsSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

const bodySchema = z.object({
  advertiserId: z.string().min(1, 'Advertiser-ID ist erforderlich.').max(100),
  advertiserName: z.string().trim().min(1).max(255).optional(),
  currency: z.string().trim().min(1).max(20).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`tiktok-ads-select:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
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

    const { accessToken, credentials: refreshedCredentials } = await getValidTikTokAdsToken(
      integration.id,
      credentials
    )
    const advertisers = await listTikTokAdvertisers(accessToken)
    const selectedAdvertiser = advertisers.find(
      (advertiser) => advertiser.id === parsedBody.data.advertiserId
    )

    if (!selectedAdvertiser) {
      return NextResponse.json(
        { error: 'Der ausgewählte TikTok Advertiser ist für dieses Konto nicht verfügbar.' },
        { status: 422 }
      )
    }

    await saveTikTokAdsIntegrationCredentials({
      integrationId: integration.id,
      status: 'connected',
      credentials: {
        ...refreshedCredentials,
        selected_advertiser_id: selectedAdvertiser.id,
        selected_advertiser_name:
          parsedBody.data.advertiserName ?? selectedAdvertiser.name,
        currency: parsedBody.data.currency ?? selectedAdvertiser.currency,
        cached_snapshots: {},
        cached_at_by_range: {},
      },
    })

    return NextResponse.json({
      advertiser: {
        id: selectedAdvertiser.id,
        name: parsedBody.data.advertiserName ?? selectedAdvertiser.name,
        currency: parsedBody.data.currency ?? selectedAdvertiser.currency,
      },
    })
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

    console.error('[tiktok-ads/select-advertiser] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TikTok-Advertiser konnte nicht gespeichert werden.' },
      { status: 500 }
    )
  }
}
