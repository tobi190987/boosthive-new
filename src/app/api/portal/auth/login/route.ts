import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const PORTAL_LOGIN_RL = { limit: 5, windowMs: 15 * 60 * 1000 }

const bodySchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse.').toLowerCase(),
})

/**
 * POST /api/portal/auth/login
 *
 * Sends a Supabase OTP (Magic Link) to the portal user.
 * Only sends if an active portal user with this email exists for the current tenant.
 * Always returns 200 to prevent email enumeration.
 */
export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const ip = getClientIp(request)
  const rl = checkRateLimit(`portal-login:${tenantId}:${ip}`, PORTAL_LOGIN_RL)
  if (!rl.allowed) return rateLimitResponse(rl)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const { email } = parsed.data

  // Check if active portal user exists (silent fail to prevent enumeration)
  const admin = createAdminClient()
  const { data: portalUser } = await admin
    .from('client_portal_users')
    .select('id, is_active')
    .eq('email', email)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (!portalUser) {
    // Return 200 to prevent email enumeration
    return NextResponse.json({ success: true })
  }

  // Build redirect URL: back to portal dashboard after magic link click
  const origin = request.nextUrl.origin
  const redirectTo = `${origin}/api/portal/auth/callback`

  // Send OTP magic link via Supabase
  const supabase = await createClient()
  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false, // Portal users must be pre-invited
    },
  })

  return NextResponse.json({ success: true })
}
