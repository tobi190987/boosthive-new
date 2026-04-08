import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeTikTokAdsCodeForToken,
  verifyTikTokAdsOAuthState,
} from '@/lib/tiktok-ads-oauth'
import { createAdminClient } from '@/lib/supabase-admin'
import { upsertTikTokAdsConnection } from '@/lib/tiktok-ads-api'

function toSafeErrorCode(error: unknown) {
  const raw = error instanceof Error ? error.message : 'unknown_error'
  return raw.slice(0, 180).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function buildRedirectUrl(
  tenantSlug: string,
  customerId: string,
  result: 'connected' | 'error',
  errorMsg?: string
) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'
  const isLocalhost = rootDomain.startsWith('localhost')
  const protocol = isLocalhost ? 'http' : 'https'
  const host = isLocalhost ? `${tenantSlug}.localhost:3000` : `${tenantSlug}.${rootDomain}`
  const params = new URLSearchParams({ customer: customerId, tab: 'integrations' })

  if (result === 'connected') {
    params.set('tiktok', 'connected')
  } else {
    params.set('tiktok_error', errorMsg ?? 'unknown_error')
  }

  return `${protocol}://${host}/tools/customers?${params.toString()}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const providerError = searchParams.get('error')

  if (!state) {
    return NextResponse.json({ error: 'Ungültige Callback-Parameter.' }, { status: 400 })
  }

  const payload = verifyTikTokAdsOAuthState(state)
  if (!payload) {
    return NextResponse.json({ error: 'Ungültiger oder abgelaufener State-Parameter.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants').select('slug').eq('id', payload.tenantId).single()

  if (!tenant?.slug) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 400 })
  }

  if (providerError === 'access_denied') {
    return NextResponse.redirect(
      buildRedirectUrl(tenant.slug, payload.customerId, 'error', 'access_denied')
    )
  }

  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(tenant.slug, payload.customerId, 'error', 'missing_code')
    )
  }

  try {
    const { data: customer, error: customerError } = await admin
      .from('customers')
      .select('id')
      .eq('id', payload.customerId)
      .eq('tenant_id', payload.tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    if (customerError || !customer) {
      return NextResponse.redirect(
        buildRedirectUrl(tenant.slug, payload.customerId, 'error', 'customer_not_found')
      )
    }

    const tokens = await exchangeTikTokAdsCodeForToken(code)

    await upsertTikTokAdsConnection({
      customerId: payload.customerId,
      userId: payload.userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      openId: tokens.open_id,
      displayName: 'TikTok Business',
    })

    return NextResponse.redirect(buildRedirectUrl(tenant.slug, payload.customerId, 'connected'))
  } catch (error) {
    console.error('[tiktok-ads/callback] Fehler:', error)
    return NextResponse.redirect(
      buildRedirectUrl(tenant.slug, payload.customerId, 'error', toSafeErrorCode(error))
    )
  }
}
