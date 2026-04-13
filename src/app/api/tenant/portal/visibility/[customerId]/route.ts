import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const PORTAL_READ = { limit: 60, windowMs: 60 * 1000 }
const PORTAL_WRITE = { limit: 30, windowMs: 60 * 1000 }

const visibilitySchema = z.object({
  show_ga4: z.boolean(),
  show_ads: z.boolean(),
  show_seo: z.boolean(),
  show_reports: z.boolean(),
})

/**
 * GET /api/tenant/portal/visibility/[customerId]
 *
 * Returns portal visibility settings for a specific customer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`portal-vis-read:${tenantId}:${getClientIp(request)}`, PORTAL_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { customerId } = await params
  const admin = createAdminClient()

  const { data } = await admin
    .from('client_portal_visibility')
    .select('show_ga4, show_ads, show_seo, show_reports')
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Return defaults if not configured yet
  return NextResponse.json({
    visibility: {
      show_ga4: data?.show_ga4 ?? true,
      show_ads: data?.show_ads ?? true,
      show_seo: data?.show_seo ?? true,
      show_reports: data?.show_reports ?? true,
    },
  })
}

/**
 * PUT /api/tenant/portal/visibility/[customerId]
 *
 * Upserts portal visibility settings for a specific customer.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`portal-vis-write:${tenantId}:${getClientIp(request)}`, PORTAL_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { customerId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const parsed = visibilitySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify customer belongs to tenant
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })

  const { error } = await admin
    .from('client_portal_visibility')
    .upsert(
      {
        customer_id: customerId,
        tenant_id: tenantId,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'customer_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
