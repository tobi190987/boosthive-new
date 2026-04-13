import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * GET /api/portal/auth/callback
 *
 * Handles the Supabase OTP / Magic Link callback after a portal user clicks
 * the email link. Supabase redirects here with ?token_hash=...&type=magiclink (or invite).
 *
 * Verifies the user is an active portal user for this tenant, sets the
 * portal_user app_metadata claim, and redirects to /portal/dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  const portalDashboard = `${origin}/portal/dashboard`
  const portalLogin = `${origin}/portal/login`

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${portalLogin}?error=missing_token`)
  }

  const supabase = await createClient()

  // Exchange OTP token for session
  const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === 'invite' ? 'invite' : 'magiclink',
  })

  if (verifyError || !authData.user) {
    return NextResponse.redirect(`${portalLogin}?error=invalid_token`)
  }

  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${portalLogin}?error=no_tenant`)
  }

  // Look up the portal user record for this email + tenant
  const admin = createAdminClient()
  const { data: portalUser } = await admin
    .from('client_portal_users')
    .select('id, customer_id, is_active')
    .eq('email', authData.user.email!)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (!portalUser) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${portalLogin}?error=no_access`)
  }

  // Set portal_user_id metadata on the auth user (idempotent)
  await admin.auth.admin.updateUserById(authData.user.id, {
    app_metadata: {
      portal_user_id: portalUser.id,
      customer_id: portalUser.customer_id,
      tenant_id: tenantId,
    },
  })

  // Link auth_user_id on the portal user record if not already set
  await admin
    .from('client_portal_users')
    .update({
      auth_user_id: authData.user.id,
      last_login: new Date().toISOString(),
    })
    .eq('id', portalUser.id)

  // Refresh session so new metadata is reflected immediately
  await supabase.auth.refreshSession()

  return NextResponse.redirect(portalDashboard)
}
