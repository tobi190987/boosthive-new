import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_WRITE } from '@/lib/rate-limit'
import { disconnectGoogleAdsIntegration, getGoogleAdsIntegration } from '@/lib/google-ads-api'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

const paramsSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`google-ads-disconnect:${tenantId}:${getClientIp(request)}`, GSC_WRITE)
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

  const integration = await getGoogleAdsIntegration(tenantId, customerId)
  if (!integration) {
    return NextResponse.json({ error: 'Keine Google-Ads-Verbindung für diesen Kunden.' }, { status: 404 })
  }

  await disconnectGoogleAdsIntegration(integration.id)
  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'google_ads_connection',
    resourceId: integration.id,
    context: { customer_id: customerId },
  })

  return NextResponse.json({})
}
