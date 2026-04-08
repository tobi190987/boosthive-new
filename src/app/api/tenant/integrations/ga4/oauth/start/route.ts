import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, GSC_CONNECT } from '@/lib/rate-limit'
import {
  buildGA4AuthorizationUrl,
  createGA4OAuthState,
  generateGA4Nonce,
} from '@/lib/ga4-oauth'

const querySchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
})

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ga4-connect:${tenantId}:${getClientIp(request)}`, GSC_CONNECT)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries())
  const parsedQuery = querySchema.safeParse(searchParams)
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.issues[0]?.message }, { status: 400 })
  }

  const { customerId } = parsedQuery.data
  const admin = createAdminClient()
  const { data: customer, error } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

  const state = createGA4OAuthState({
    customerId,
    tenantId,
    userId: authResult.auth.userId,
    nonce: generateGA4Nonce(),
    issuedAt: Date.now(),
  })

  return NextResponse.json({ url: buildGA4AuthorizationUrl(state) })
}
