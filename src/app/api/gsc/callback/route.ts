/**
 * PROJ-26: Google OAuth callback — central route, no tenant context needed.
 *
 * Google redirects here after the user grants/denies access.
 * The `state` parameter contains projectId + tenantId (HMAC-signed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOAuthNonceCookieName, verifyOAuthState } from '@/lib/gsc-oauth'
import { exchangeCodeForTokens, getGoogleEmail } from '@/lib/gsc-oauth'
import { encryptToken } from '@/lib/gsc-crypto'
import { createAdminClient } from '@/lib/supabase-admin'

const stateProjectSchema = z.object({
  projectId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
})

function buildRedirectUrl(tenantSlug: string, projectId: string, result: 'connected' | 'error', errorMsg?: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'
  const isLocalhost = rootDomain.startsWith('localhost')
  const protocol = isLocalhost ? 'http' : 'https'
  const host = isLocalhost ? `${tenantSlug}.localhost:3000` : `${tenantSlug}.${rootDomain}`
  const base = `${protocol}://${host}/tools/keywords/${projectId}`

  if (result === 'connected') return `${base}?gsc=connected`
  return `${base}?gsc_error=${encodeURIComponent(errorMsg ?? 'unknown_error')}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (!state) {
    if (error === 'access_denied') {
      return NextResponse.redirect(new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
    }
    return NextResponse.json({ error: 'Ungueltige Callback-Parameter.' }, { status: 400 })
  }

  // Verify state (CSRF protection)
  const payload = verifyOAuthState(state)
  if (!payload) {
    return NextResponse.json({ error: 'Ungueltiger oder abgelaufener State-Parameter.' }, { status: 400 })
  }

  const parsedPayload = stateProjectSchema.safeParse(payload)
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'Ungueltiger State-Payload.' }, { status: 400 })
  }

  const { projectId, tenantId, userId } = parsedPayload.data

  // Look up tenant slug for redirect
  const admin = createAdminClient()
  const { data: tenant } = await admin
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single()

  const tenantSlug = tenant?.slug ?? 'unknown'
  const nonceCookieName = getOAuthNonceCookieName(payload.nonce)
  const nonceCookie = request.cookies.get(nonceCookieName)

  if (!nonceCookie || nonceCookie.value !== userId) {
    return NextResponse.redirect(
      buildRedirectUrl(tenantSlug, projectId, 'error', 'invalid_oauth_session')
    )
  }

  if (error === 'access_denied') {
    const response = NextResponse.redirect(
      buildRedirectUrl(tenantSlug, projectId, 'error', 'access_denied')
    )
    response.cookies.delete(nonceCookieName)
    return response
  }

  if (!code) {
    const response = NextResponse.json({ error: 'Ungueltige Callback-Parameter.' }, { status: 400 })
    response.cookies.delete(nonceCookieName)
    return response
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    if (!tokens.refresh_token) {
      const response = NextResponse.redirect(
        buildRedirectUrl(tenantSlug, projectId, 'error', 'no_refresh_token')
      )
      response.cookies.delete(nonceCookieName)
      return response
    }

    // Get Google account email
    const googleEmail = await getGoogleEmail(tokens.access_token)

    // Encrypt tokens before saving
    const encryptedAccessToken = encryptToken(tokens.access_token)
    const encryptedRefreshToken = encryptToken(tokens.refresh_token)
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Upsert gsc_connection (1:1 per project — UNIQUE on project_id)
    const { error: dbError } = await admin
      .from('gsc_connections')
      .upsert(
        {
          project_id: projectId,
          tenant_id: tenantId,
          google_email: googleEmail,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          token_expires_at: tokenExpiresAt,
          status: 'connected',
          connected_at: new Date().toISOString(),
          connected_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      )

    if (dbError) {
      console.error('[gsc/callback] DB error:', dbError.message)
      const response = NextResponse.redirect(
        buildRedirectUrl(tenantSlug, projectId, 'error', 'db_error')
      )
      response.cookies.delete(nonceCookieName)
      return response
    }

    const response = NextResponse.redirect(
      buildRedirectUrl(tenantSlug, projectId, 'connected')
    )
    response.cookies.delete(nonceCookieName)
    return response
  } catch (err) {
    console.error('[gsc/callback] Error:', err)
    const response = NextResponse.redirect(
      buildRedirectUrl(tenantSlug, projectId, 'error', 'token_exchange_failed')
    )
    response.cookies.delete(nonceCookieName)
    return response
  }
}
