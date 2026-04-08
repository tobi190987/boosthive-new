import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_READ, GSC_WRITE } from '@/lib/rate-limit'
import {
  disconnectMetaAdsIntegration,
  getMetaAdsDashboardSnapshot,
  getMetaAdsIntegration,
  parseMetaAdsCredentials,
  type MetaAdsDateRangeKey,
} from '@/lib/meta-ads-api'
import { MetaAdsTokenExpiredError } from '@/lib/meta-ads-oauth'
import { isCredentialsDecryptError } from '@/lib/customer-credentials-encryption'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

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

    const rl = checkRateLimit(`meta-ads-data:${tenantId}:${getClientIp(request)}`, GSC_READ)
    if (!rl.allowed) return rateLimitResponse(rl)

    const authResult = await requireTenantAdmin(tenantId)
    if ('error' in authResult) return authResult.error

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: parsedParams.error.issues[0]?.message }, { status: 400 })
    }

    const parsedQuery = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    )
    if (!parsedQuery.success) {
      return NextResponse.json({ error: parsedQuery.error.issues[0]?.message }, { status: 400 })
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
    if (!integration || integration.status === 'disconnected') {
      return NextResponse.json({ connected: false, data: null, trend: null })
    }

    const credentials = parseMetaAdsCredentials(integration.credentials_encrypted)
    if (!credentials) {
      return NextResponse.json({ connected: false, data: null, trend: null })
    }

    if (integration.status === 'token_expired') {
      return NextResponse.json(
        { error: 'Die Meta-Ads-Verbindung ist abgelaufen. Bitte in der Kundenverwaltung erneut verbinden.' },
        { status: 403 }
      )
    }

    if (!credentials.selected_ad_account_id) {
      return NextResponse.json({
        connected: false,
        data: null,
        trend: null,
      })
    }

    const snapshot = await getMetaAdsDashboardSnapshot(
      integration,
      credentials,
      (parsedQuery.data.range ?? '30d') as MetaAdsDateRangeKey
    )

    return NextResponse.json({
      connected: true,
      data: snapshot.data,
      trend: snapshot.trend,
    })
  } catch (error) {
    if (error instanceof MetaAdsTokenExpiredError) {
      return NextResponse.json(
        { error: 'Die Meta-Ads-Verbindung wurde widerrufen oder ist abgelaufen. Bitte erneut verbinden.' },
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

    console.error('[meta-ads/data] Fehler:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Meta-Ads-Daten konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`meta-ads-disconnect:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
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

  await disconnectMetaAdsIntegration(integration.id)
  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'meta_ads_connection',
    resourceId: integration.id,
    context: { customer_id: parsedParams.data.customerId },
  })

  return NextResponse.json({})
}
