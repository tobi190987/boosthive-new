import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'
import {
  getGoogleAdsIntegration,
  getValidGoogleAdsToken,
  listGoogleAdsAccounts,
  parseGoogleAdsCredentials,
  saveGoogleAdsIntegrationCredentials,
} from '@/lib/google-ads-api'
import { GoogleAdsTokenRevokedError } from '@/lib/google-ads-oauth'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'

const paramsSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

const bodySchema = z.object({
  accountId: z.string().min(1, 'Account-ID ist erforderlich.').max(50),
  accountName: z.string().trim().min(1).max(255).optional(),
  currency: z.string().trim().min(1).max(16).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`google-ads-account:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
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

    const integration = await getGoogleAdsIntegration(tenantId, customerId)
    if (!integration) {
      return NextResponse.json({ error: 'Keine Google-Ads-Verbindung für diesen Kunden.' }, { status: 404 })
    }

    const credentials = parseGoogleAdsCredentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ error: 'Keine lesbaren Google-Ads-Credentials vorhanden.' }, { status: 409 })
    }

    const { accessToken, credentials: refreshedCredentials } = await getValidGoogleAdsToken(
      integration.id,
      credentials
    )
    const accounts = await listGoogleAdsAccounts(accessToken)
    const selectedAccount = accounts.find((account) => account.id === parsedBody.data.accountId.replace(/\D/g, ''))

    if (!selectedAccount) {
      return NextResponse.json(
        { error: 'Der ausgewählte Google-Ads-Account ist für dieses Google-Konto nicht verfügbar.' },
        { status: 422 }
      )
    }

    await saveGoogleAdsIntegrationCredentials({
      integrationId: integration.id,
      status: 'connected',
      credentials: {
        ...refreshedCredentials,
        google_ads_customer_id: selectedAccount.id,
        google_ads_customer_name: parsedBody.data.accountName ?? selectedAccount.name,
        google_ads_manager_customer_id: selectedAccount.managerCustomerId,
        currency_code: parsedBody.data.currency ?? selectedAccount.currency,
      },
    })

    return NextResponse.json({
      account: {
        id: selectedAccount.id,
        name: parsedBody.data.accountName ?? selectedAccount.name,
        currency: parsedBody.data.currency ?? selectedAccount.currency,
      },
    })
  } catch (error) {
    if (error instanceof GoogleAdsTokenRevokedError) {
      return NextResponse.json(
        { error: 'Google-Ads-Token wurde widerrufen. Bitte die Verbindung erneut herstellen.' },
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

    console.error('[google-ads/select-account] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Google-Ads-Account konnte nicht gespeichert werden.' },
      { status: 500 }
    )
  }
}
