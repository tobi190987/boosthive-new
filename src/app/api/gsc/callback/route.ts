/**
 * PROJ-26: Google OAuth callback — central route, no tenant context needed.
 *
 * Google redirects here after the user grants/denies access.
 * The `state` parameter contains projectId + tenantId (HMAC-signed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyOAuthState } from '@/lib/gsc-oauth'
import { exchangeCodeForTokens, getGoogleEmail } from '@/lib/gsc-oauth'
import { encryptToken } from '@/lib/gsc-crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { verifyGA4OAuthState, exchangeGA4CodeForTokens, getGA4GoogleEmail } from '@/lib/ga4-oauth'
import { upsertGA4Connection } from '@/lib/ga4-api'

const stateProjectSchema = z.object({
  projectId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
})

function toSafeErrorCode(error: unknown) {
  const raw = error instanceof Error ? error.message : 'unknown_error'
  return raw
    .slice(0, 180)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

function toSafeGa4ErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : 'unknown_error'
  const normalized = raw.toLowerCase()

  if (normalized.includes('customer_credentials_encryption_key')) {
    return 'Die sichere Speicherung der GA4-Zugangsdaten ist aktuell nicht korrekt konfiguriert. Bitte CUSTOMER_CREDENTIALS_ENCRYPTION_KEY prüfen.'
  }

  if (
    normalized.includes('unable to authenticate data') ||
    normalized.includes('unsupported state') ||
    normalized.includes('ungültiges credentials-format')
  ) {
    return 'Die gespeicherten GA4-Zugangsdaten konnten nicht verarbeitet werden. Bitte die Verbindung trennen und erneut herstellen.'
  }

  if (normalized.includes('google_client_id')) {
    return 'Google OAuth ist nicht korrekt konfiguriert: GOOGLE_CLIENT_ID fehlt.'
  }

  if (normalized.includes('google_client_secret')) {
    return 'Google OAuth ist nicht korrekt konfiguriert: GOOGLE_CLIENT_SECRET fehlt.'
  }

  if (normalized.includes('ga4_state_secret') || normalized.includes('gsc_state_secret')) {
    return 'Google OAuth ist nicht korrekt konfiguriert: Das GA4-State-Secret fehlt oder ist zu kurz.'
  }

  if (normalized.includes('ga4 token-exchange fehlgeschlagen')) {
    return 'Google hat den GA4-Login nicht akzeptiert. Bitte die Verbindung erneut starten.'
  }

  if (normalized.includes('google userinfo abfrage fehlgeschlagen')) {
    return 'Das Google-Konto konnte nach dem Login nicht gelesen werden. Bitte erneut versuchen.'
  }

  return 'Die GA4-Verbindung konnte nicht abgeschlossen werden. Bitte erneut versuchen.'
}

function buildRedirectUrl(tenantSlug: string, projectId: string, result: 'connected' | 'error', errorMsg?: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'
  const isLocalhost = rootDomain.startsWith('localhost')
  const protocol = isLocalhost ? 'http' : 'https'
  const host = isLocalhost ? `${tenantSlug}.localhost:3000` : `${tenantSlug}.${rootDomain}`
  const params = new URLSearchParams({
    project: projectId,
    tab: 'integrations',
  })

  if (result === 'connected') {
    params.set('gsc', 'connected')
  } else {
    params.set('gsc_error', errorMsg ?? 'unknown_error')
  }

  return `${protocol}://${host}/tools/keywords?${params.toString()}`
}

function buildGa4RedirectUrl(
  tenantSlug: string,
  customerId: string,
  result: 'connected' | 'error',
  errorMsg?: string
): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'
  const isLocalhost = rootDomain.startsWith('localhost')
  const protocol = isLocalhost ? 'http' : 'https'
  const host = isLocalhost ? `${tenantSlug}.localhost:3000` : `${tenantSlug}.${rootDomain}`
  const params = new URLSearchParams({
    customer: customerId,
    tab: 'integrations',
  })

  if (result === 'connected') {
    params.set('ga4', 'connected')
  } else {
    params.set('ga4_error', errorMsg ?? 'unknown_error')
  }

  return `${protocol}://${host}/tools/customers?${params.toString()}`
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
    return NextResponse.json({ error: 'Ungültige Callback-Parameter.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // GA4 branch: reuse the same Google callback route as GSC so only one
  // redirect URI has to be registered in Google Cloud Console.
  const ga4Payload = verifyGA4OAuthState(state)
  if (ga4Payload) {
    const { data: tenant } = await admin
      .from('tenants')
      .select('slug')
      .eq('id', ga4Payload.tenantId)
      .single()

    if (!tenant?.slug) {
      return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 400 })
    }

    if (error === 'access_denied') {
      return NextResponse.redirect(
        buildGa4RedirectUrl(tenant.slug, ga4Payload.customerId, 'error', 'access_denied')
      )
    }

    if (!code) {
      return NextResponse.redirect(
        buildGa4RedirectUrl(tenant.slug, ga4Payload.customerId, 'error', 'missing_code')
      )
    }

    try {
      const { data: customer, error: customerError } = await admin
        .from('customers')
        .select('id')
        .eq('id', ga4Payload.customerId)
        .eq('tenant_id', ga4Payload.tenantId)
        .is('deleted_at', null)
        .maybeSingle()

      if (customerError || !customer) {
        return NextResponse.redirect(
          buildGa4RedirectUrl(tenant.slug, ga4Payload.customerId, 'error', 'customer_not_found')
        )
      }

      const tokens = await exchangeGA4CodeForTokens(code)
      if (!tokens.refresh_token) {
        return NextResponse.redirect(
          buildGa4RedirectUrl(tenant.slug, ga4Payload.customerId, 'error', 'no_refresh_token')
        )
      }

      const googleEmail = await getGA4GoogleEmail(tokens.access_token)
      await upsertGA4Connection({
        tenantId: ga4Payload.tenantId,
        customerId: ga4Payload.customerId,
        userId: ga4Payload.userId,
        googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      })

      return NextResponse.redirect(
        buildGa4RedirectUrl(tenant.slug, ga4Payload.customerId, 'connected')
      )
    } catch (err) {
      console.error('[ga4/gsc-callback] Error:', err)
      return NextResponse.redirect(
        buildGa4RedirectUrl(tenant.slug, ga4Payload.customerId, 'error', toSafeGa4ErrorMessage(err))
      )
    }
  }

  // Verify state (CSRF protection)
  const payload = verifyOAuthState(state)
  if (!payload) {
    return NextResponse.json({ error: 'Ungültiger oder abgelaufener State-Parameter.' }, { status: 400 })
  }

  const parsedPayload = stateProjectSchema.safeParse(payload)
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'Ungültiger State-Payload.' }, { status: 400 })
  }

  const { projectId, tenantId, userId } = parsedPayload.data

  // Look up tenant slug for redirect
  const { data: tenant } = await admin
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single()

  if (!tenant?.slug) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 400 })
  }

  const tenantSlug = tenant.slug

  if (error === 'access_denied') {
    return NextResponse.redirect(
      buildRedirectUrl(tenantSlug, projectId, 'error', 'access_denied')
    )
  }

  if (!code) {
    return NextResponse.json({ error: 'Ungültige Callback-Parameter.' }, { status: 400 })
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        buildRedirectUrl(tenantSlug, projectId, 'error', 'no_refresh_token')
      )
    }

    // Get Google account email
    const googleEmail = await getGoogleEmail(tokens.access_token)

    // Encrypt tokens before saving
    const encryptedAccessToken = encryptToken(tokens.access_token)
    const encryptedRefreshToken = encryptToken(tokens.refresh_token)
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Upsert gsc_connection (1:1 per project — UNIQUE on project_id)
    const { data: existingConnection, error: existingConnectionError } = await admin
      .from('gsc_connections')
      .select('selected_property')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (existingConnectionError) {
      console.error('[gsc/callback] Existing connection lookup error:', existingConnectionError)
      return NextResponse.redirect(
        buildRedirectUrl(tenantSlug, projectId, 'error', toSafeErrorCode(existingConnectionError.message))
      )
    }

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
          selected_property: existingConnection?.selected_property ?? null,
          status: 'connected',
          connected_at: new Date().toISOString(),
          connected_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      )

    if (dbError) {
      console.error('[gsc/callback] DB error:', dbError)
      return NextResponse.redirect(
        buildRedirectUrl(tenantSlug, projectId, 'error', toSafeErrorCode(dbError.message))
      )
    }

    return NextResponse.redirect(
      buildRedirectUrl(tenantSlug, projectId, 'connected')
    )
  } catch (err) {
    console.error('[gsc/callback] Error:', err)
    return NextResponse.redirect(
      buildRedirectUrl(tenantSlug, projectId, 'error', toSafeErrorCode(err))
    )
  }
}
