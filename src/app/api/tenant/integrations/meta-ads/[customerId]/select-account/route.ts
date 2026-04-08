import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'
import {
  getMetaAdsIntegration,
  getValidMetaAdsToken,
  listMetaAdsAccounts,
  parseMetaAdsCredentials,
  saveMetaAdsIntegrationCredentials,
} from '@/lib/meta-ads-api'
import { MetaAdsTokenExpiredError } from '@/lib/meta-ads-oauth'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'

const paramsSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

const bodySchema = z.object({
  accountId: z.string().min(1, 'Account-ID ist erforderlich.').max(100),
  accountName: z.string().trim().min(1).max(255).optional(),
  businessName: z.string().trim().min(1).max(255).optional(),
  currency: z.string().trim().min(1).max(20).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id')
    if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

    const rl = checkRateLimit(`meta-ads-select:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
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

    const integration = await getMetaAdsIntegration(tenantId, parsedParams.data.customerId)
    if (!integration) {
      return NextResponse.json({ error: 'Keine Meta-Ads-Verbindung für diesen Kunden.' }, { status: 404 })
    }

    const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ error: 'Keine lesbaren Meta-Ads-Credentials vorhanden.' }, { status: 409 })
    }

    const { accessToken, credentials: refreshedCredentials } = await getValidMetaAdsToken(
      integration.id,
      credentials
    )
    const accounts = await listMetaAdsAccounts(accessToken)
    const selectedAccount = accounts.find((account) => account.id === parsedBody.data.accountId)

    if (!selectedAccount) {
      return NextResponse.json(
        { error: 'Der ausgewählte Meta Ad Account ist für dieses Konto nicht verfügbar.' },
        { status: 422 }
      )
    }

    await saveMetaAdsIntegrationCredentials({
      integrationId: integration.id,
      status: 'connected',
      credentials: {
        ...refreshedCredentials,
        selected_ad_account_id: selectedAccount.id,
        selected_ad_account_name: parsedBody.data.accountName ?? selectedAccount.name,
        business_name: parsedBody.data.businessName ?? selectedAccount.businessName,
        currency: parsedBody.data.currency ?? selectedAccount.currency,
        cached_snapshots: {},
        cached_at_by_range: {},
      },
    })

    return NextResponse.json({
      account: {
        id: selectedAccount.id,
        name: parsedBody.data.accountName ?? selectedAccount.name,
        businessName: parsedBody.data.businessName ?? selectedAccount.businessName,
        currency: parsedBody.data.currency ?? selectedAccount.currency,
      },
    })
  } catch (error) {
    if (error instanceof MetaAdsTokenExpiredError) {
      return NextResponse.json(
        { error: 'Meta-Ads-Token wurde widerrufen oder ist abgelaufen. Bitte erneut verbinden.' },
        { status: 403 }
      )
    }

    if (isCredentialsDecryptError(error)) {
      return NextResponse.json(
        {
          error:
            'Die gespeicherte Meta-Ads-Verbindung kann mit dem aktuellen Verschluesselungs-Schluessel nicht gelesen werden. Bitte trenne die Verbindung und verbinde Meta Ads erneut.',
        },
        { status: 409 }
      )
    }

    console.error('[meta-ads/select-account] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Meta-Ad-Account konnte nicht gespeichert werden.' },
      { status: 500 }
    )
  }
}
