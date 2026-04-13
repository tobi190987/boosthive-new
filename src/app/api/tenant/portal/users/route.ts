import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const PORTAL_WRITE = { limit: 20, windowMs: 60 * 1000 }
const PORTAL_READ = { limit: 60, windowMs: 60 * 1000 }

const inviteSchema = z.object({
  customerId: z.string().uuid('Ungültige Kunden-ID.'),
  email: z.string().email('Ungültige E-Mail-Adresse.').toLowerCase(),
  name: z.string().trim().max(200).nullable().optional(),
})

/**
 * GET /api/tenant/portal/users?customerId=xxx
 *
 * Lists portal users for a specific customer.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`portal-users-read:${tenantId}:${getClientIp(request)}`, PORTAL_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const customerId = new URL(request.url).searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'customerId fehlt.' }, { status: 400 })

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

  const { data: users, error } = await admin
    .from('client_portal_users')
    .select('id, email, name, is_active, invited_at, last_login')
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .order('invited_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ users: users ?? [] })
}

/**
 * POST /api/tenant/portal/users
 *
 * Invites a new portal user for a customer. Creates the Supabase Auth account
 * via inviteUserByEmail and stores a row in client_portal_users.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`portal-users-write:${tenantId}:${getClientIp(request)}`, PORTAL_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const { customerId, email, name } = parsed.data
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

  // Check if already invited
  const { data: existing } = await admin
    .from('client_portal_users')
    .select('id, is_active')
    .eq('email', email)
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existing) {
    if (existing.is_active) {
      return NextResponse.json(
        { error: 'Diese E-Mail-Adresse hat bereits einen aktiven Portal-Zugang.' },
        { status: 409 }
      )
    }
    // Reactivate if previously deactivated — also send a fresh invite email
    await admin
      .from('client_portal_users')
      .update({ is_active: true, invited_at: new Date().toISOString() })
      .eq('id', existing.id)

    const redirectTo = `${request.nextUrl.origin}/portal/auth/callback`
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        portal_user_id: existing.id,
        customer_id: customerId,
        tenant_id: tenantId,
      },
    })

    return NextResponse.json({ success: true })
  }

  // Create portal user DB record first (to get the ID for app_metadata)
  const { data: newPortalUser, error: insertError } = await admin
    .from('client_portal_users')
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      email,
      name: name ?? null,
    })
    .select('id')
    .single()

  if (insertError || !newPortalUser) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Fehler beim Anlegen des Portal-Zugangs.' },
      { status: 500 }
    )
  }

  // inviteUserByEmail uses the old implicit flow — tokens land in the URL hash.
  // The redirect must point to the client-side page /portal/auth/callback (not the API route).
  const redirectTo = `${request.nextUrl.origin}/portal/auth/callback`
  const { data: authInvite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo,
      data: {
        portal_user_id: newPortalUser.id,
        customer_id: customerId,
        tenant_id: tenantId,
      },
    }
  )

  if (inviteError) {
    // Clean up DB record if invite failed
    await admin.from('client_portal_users').delete().eq('id', newPortalUser.id)
    return NextResponse.json(
      { error: `Einladungs-E-Mail fehlgeschlagen: ${inviteError.message}` },
      { status: 500 }
    )
  }

  // Link the auth user ID
  if (authInvite?.user?.id) {
    await admin
      .from('client_portal_users')
      .update({ auth_user_id: authInvite.user.id })
      .eq('id', newPortalUser.id)
  }

  return NextResponse.json({ success: true, portalUserId: newPortalUser.id })
}
