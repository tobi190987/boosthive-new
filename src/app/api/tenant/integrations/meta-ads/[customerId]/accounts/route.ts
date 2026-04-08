import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ } from '@/lib/rate-limit'
import {
  getMetaAdsIntegration,
  getValidMetaAdsToken,
  listMetaAdsAccounts,
  parseMetaAdsCredentials,
} from '@/lib/meta-ads-api'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'
import { MetaAdsTokenExpiredError } from '@/lib/meta-ads-oauth'

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

    const rl = checkRateLimit(`meta-ads-accounts:${tenantId}:${getClientIp(request)}`, GSC_READ)
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

    const integration = await getMetaAdsIntegration(tenantId, parsedParams.data.customerId)
    if (!integration) {
      return NextResponse.json({ error: 'Keine Meta-Ads-Verbindung für diesen Kunden.' }, { status: 404 })
    }

    const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ error: 'Keine lesbaren Meta-Ads-Credentials vorhanden.' }, { status: 409 })
    }

    const { accessToken } = await getValidMetaAdsToken(integration.id, credentials)
    const accounts = await listMetaAdsAccounts(accessToken)
    return NextResponse.json({ accounts })
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

    console.error('[meta-ads/accounts] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Meta-Ad-Accounts konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
