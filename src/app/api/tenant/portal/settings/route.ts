import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const PORTAL_READ = { limit: 60, windowMs: 60 * 1000 }
const PORTAL_WRITE = { limit: 20, windowMs: 60 * 1000 }

const settingsSchema = z.object({
  portal_logo_url: z.string().url('Ungültige Logo-URL.').nullable().optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Farbe muss im Format #rrggbb angegeben werden.')
    .optional(),
  agency_name: z.string().trim().max(200).nullable().optional(),
  custom_domain: z.string().trim().max(500).nullable().optional(),
})

/**
 * GET /api/tenant/portal/settings
 *
 * Returns portal branding settings for the current tenant.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`portal-settings-read:${tenantId}:${getClientIp(request)}`, PORTAL_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()
  const { data } = await admin
    .from('client_portal_settings')
    .select('portal_logo_url, primary_color, agency_name, custom_domain')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return NextResponse.json({ settings: data ?? null })
}

/**
 * PUT /api/tenant/portal/settings
 *
 * Upserts portal branding settings for the current tenant.
 */
export async function PUT(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`portal-settings-write:${tenantId}:${getClientIp(request)}`, PORTAL_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('client_portal_settings')
    .upsert(
      {
        tenant_id: tenantId,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
