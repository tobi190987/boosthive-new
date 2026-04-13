import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const RL = { limit: 30, windowMs: 60 * 1000 }

/**
 * GET /api/portal/tenant-lookup?tenantId=<uuid>
 *
 * Public endpoint — returns only the tenant slug for a given tenant ID.
 * Used by the root-domain /portal-invite relay page to build the correct
 * tenant-subdomain redirect URL after a Supabase invite callback.
 *
 * Returns { slug } — no sensitive tenant data exposed.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`portal-tenant-lookup:${ip}`, RL)
  if (!rl.allowed) return rateLimitResponse(rl)

  const tenantId = new URL(request.url).searchParams.get('tenantId')
  if (!tenantId || !/^[0-9a-f-]{36}$/.test(tenantId)) {
    return NextResponse.json({ error: 'Ungültige tenantId.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data?.slug) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({ slug: data.slug })
}
