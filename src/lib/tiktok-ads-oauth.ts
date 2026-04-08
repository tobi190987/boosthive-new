import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3'
const STATE_TTL_MS = 10 * 60 * 1000

const SCOPES = ['ad.read']

function getClientKey(): string {
  const value = process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_APP_ID
  if (!value) throw new Error('TIKTOK_CLIENT_KEY oder TIKTOK_APP_ID ist nicht gesetzt.')
  return value
}

function getAppId(): string {
  const value = process.env.TIKTOK_APP_ID || process.env.TIKTOK_CLIENT_KEY
  if (!value) throw new Error('TIKTOK_APP_ID oder TIKTOK_CLIENT_KEY ist nicht gesetzt.')
  return value
}

function getAppSecret(): string {
  const value = process.env.TIKTOK_APP_SECRET
  if (!value) throw new Error('TIKTOK_APP_SECRET ist nicht gesetzt.')
  return value
}

function getStateSecret(): string {
  const value = process.env.TIKTOK_ADS_STATE_SECRET
  if (!value || value.length < 16) {
    throw new Error('TIKTOK_ADS_STATE_SECRET muss als Umgebungsvariable gesetzt sein.')
  }
  return value
}

function getCallbackUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${appUrl}/api/tenant/integrations/tiktok-ads/oauth/callback`
}

export interface TikTokAdsOAuthStatePayload {
  customerId: string
  tenantId: string
  userId: string
  nonce: string
  issuedAt: number
}

export interface TikTokAdsTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_expires_in?: number
  open_id?: string
  scope?: string
  advertiser_ids?: string[]
}

interface TikTokApiEnvelope<T> {
  code?: number
  message?: string
  request_id?: string
  data?: T
}

interface TikTokTokenPayload {
  access_token?: string
  refresh_token?: string
  expires_in?: number | string
  refresh_expires_in?: number | string
  open_id?: string
  scope?: string
  advertiser_ids?: string[]
}

const TOKEN_INVALID_MARKERS = ['invalid_grant', 'access_token_invalid', 'refresh_token', 'invalid_token']
const TOKEN_ENDPOINT_UNSUPPORTED_MARKERS = ['404', '405', 'not found', 'unsupported', 'invalid path']

export function generateTikTokAdsNonce(): string {
  return randomBytes(16).toString('hex')
}

export function createTikTokAdsOAuthState(payload: TikTokAdsOAuthStatePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const hmac = createHmac('sha256', getStateSecret()).update(encoded).digest('hex')
  return `${encoded}.${hmac}`
}

export function verifyTikTokAdsOAuthState(state: string): TikTokAdsOAuthStatePayload | null {
  const dotIndex = state.lastIndexOf('.')
  if (dotIndex === -1) return null

  const encoded = state.slice(0, dotIndex)
  const receivedHmac = state.slice(dotIndex + 1)
  const expectedHmac = createHmac('sha256', getStateSecret()).update(encoded).digest('hex')

  const receivedBuffer = Buffer.from(receivedHmac, 'hex')
  const expectedBuffer = Buffer.from(expectedHmac, 'hex')

  if (receivedBuffer.length === 0 || receivedBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TikTokAdsOAuthStatePayload

    if (
      typeof payload.customerId !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      typeof payload.userId !== 'string' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.issuedAt !== 'number'
    ) {
      return null
    }

    if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function buildTikTokAdsAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: getClientKey(),
    scope: SCOPES.join(','),
    response_type: 'code',
    redirect_uri: getCallbackUrl(),
    state,
  })

  return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`
}

function normalizeTikTokTokenPayload(data: TikTokTokenPayload | undefined): TikTokAdsTokenResponse {
  if (!data?.access_token || !data.refresh_token || data.expires_in === undefined) {
    throw new Error('TikTok Token-Antwort ist unvollstaendig.')
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in:
      typeof data.expires_in === 'string' ? Number.parseInt(data.expires_in, 10) : data.expires_in,
    refresh_expires_in:
      typeof data.refresh_expires_in === 'string'
        ? Number.parseInt(data.refresh_expires_in, 10)
        : data.refresh_expires_in,
    open_id: data.open_id,
    scope: data.scope,
    advertiser_ids: data.advertiser_ids,
  }
}

function containsAnyMarker(message: string, markers: string[]): boolean {
  return markers.some((marker) => message.includes(marker))
}

async function postTikTokTokenRequest(options: {
  endpoint: string
  body: Record<string, string>
  operation: 'exchange' | 'refresh'
}): Promise<TikTokAdsTokenResponse> {
  const response = await fetch(`${TIKTOK_API_BASE}${options.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options.body),
  })

  const text = await response.text().catch(() => '')
  let payload: TikTokApiEnvelope<TikTokTokenPayload> | null = null

  try {
    payload = text ? (JSON.parse(text) as TikTokApiEnvelope<TikTokTokenPayload>) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(`TikTok Token-${options.operation} fehlgeschlagen: ${response.status} ${text}`)
  }

  if (payload?.code && payload.code !== 0) {
    const message = payload.message || 'unknown_error'
    const normalizedMessage = message.toLowerCase()
    if (containsAnyMarker(normalizedMessage, TOKEN_INVALID_MARKERS)) {
      throw new TikTokAdsTokenExpiredError(`TikTok Token-${options.operation} fehlgeschlagen: ${message}`)
    }
    throw new Error(`TikTok Token-${options.operation} fehlgeschlagen: ${message}`)
  }

  return normalizeTikTokTokenPayload(payload?.data)
}

export async function exchangeTikTokAdsCodeForToken(code: string): Promise<TikTokAdsTokenResponse> {
  return postTikTokTokenRequest({
    endpoint: '/oauth2/access_token/',
    operation: 'exchange',
    body: {
      app_id: getAppId(),
      secret: getAppSecret(),
      auth_code: code,
    },
  })
}

export async function refreshTikTokAdsAccessToken(refreshToken: string): Promise<TikTokAdsTokenResponse> {
  try {
    return await postTikTokTokenRequest({
      endpoint: '/oauth2/refresh_token/',
      operation: 'refresh',
      body: {
        app_id: getAppId(),
        secret: getAppSecret(),
        refresh_token: refreshToken,
      },
    })
  } catch (error) {
    if (error instanceof TikTokAdsTokenExpiredError) {
      throw error
    }

    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (containsAnyMarker(message, TOKEN_INVALID_MARKERS)) {
      throw new TikTokAdsTokenExpiredError('TikTok Refresh-Token wurde widerrufen oder ist ungueltig.')
    }

    if (containsAnyMarker(message, TOKEN_ENDPOINT_UNSUPPORTED_MARKERS)) {
      return postTikTokTokenRequest({
        endpoint: '/oauth2/access_token/',
        operation: 'refresh',
        body: {
          app_id: getAppId(),
          secret: getAppSecret(),
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        },
      })
    }

    throw error
  }
}

export async function revokeTikTokAdsAccessToken(options: {
  accessToken: string
  openId?: string
}): Promise<void> {
  if (!options.openId) return

  const response = await fetch(`${TIKTOK_API_BASE}/oauth2/revoke/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: getAppId(),
      secret: getAppSecret(),
      open_id: options.openId,
      access_token: options.accessToken,
    }),
  })

  if (!response.ok) return
}

export class TikTokAdsTokenExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TikTokAdsTokenExpiredError'
  }
}
