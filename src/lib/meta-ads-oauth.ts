import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const META_OAUTH_URL = 'https://www.facebook.com/v24.0/dialog/oauth'
const META_GRAPH_API = 'https://graph.facebook.com/v24.0'
const STATE_TTL_MS = 10 * 60 * 1000

const SCOPES = ['ads_read', 'business_management']

function getAppId(): string {
  const value = process.env.META_APP_ID
  if (!value) throw new Error('META_APP_ID ist nicht gesetzt.')
  return value
}

function getAppSecret(): string {
  const value = process.env.META_APP_SECRET
  if (!value) throw new Error('META_APP_SECRET ist nicht gesetzt.')
  return value
}

function getStateSecret(): string {
  const value = process.env.META_ADS_STATE_SECRET
  if (!value || value.length < 16) {
    throw new Error('META_ADS_STATE_SECRET muss als Umgebungsvariable gesetzt sein.')
  }
  return value
}

function getCallbackUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${appUrl}/api/tenant/integrations/meta-ads/oauth/callback`
}

export interface MetaAdsOAuthStatePayload {
  customerId: string
  tenantId: string
  userId: string
  nonce: string
  issuedAt: number
}

export interface MetaAdsTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

export function generateMetaAdsNonce(): string {
  return randomBytes(16).toString('hex')
}

export function createMetaAdsOAuthState(payload: MetaAdsOAuthStatePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const hmac = createHmac('sha256', getStateSecret()).update(encoded).digest('hex')
  return `${encoded}.${hmac}`
}

export function verifyMetaAdsOAuthState(state: string): MetaAdsOAuthStatePayload | null {
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
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as MetaAdsOAuthStatePayload

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

export function buildMetaAdsAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getAppId(),
    redirect_uri: getCallbackUrl(),
    state,
    response_type: 'code',
    scope: SCOPES.join(','),
  })

  return `${META_OAUTH_URL}?${params.toString()}`
}

export async function exchangeMetaAdsCodeForToken(code: string): Promise<MetaAdsTokenResponse> {
  const params = new URLSearchParams({
    client_id: getAppId(),
    client_secret: getAppSecret(),
    redirect_uri: getCallbackUrl(),
    code,
  })

  const response = await fetch(`${META_GRAPH_API}/oauth/access_token?${params.toString()}`)
  if (!response.ok) {
    const error = await response.text().catch(() => '')
    throw new Error(`Meta Token-Exchange fehlgeschlagen: ${response.status} ${error}`)
  }

  return response.json() as Promise<MetaAdsTokenResponse>
}

export async function exchangeForLongLivedMetaToken(
  accessToken: string
): Promise<Required<Pick<MetaAdsTokenResponse, 'access_token' | 'expires_in'>>> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: getAppId(),
    client_secret: getAppSecret(),
    fb_exchange_token: accessToken,
  })

  const response = await fetch(`${META_GRAPH_API}/oauth/access_token?${params.toString()}`)
  if (!response.ok) {
    const error = await response.text().catch(() => '')
    throw new Error(`Meta Long-lived Token fehlgeschlagen: ${response.status} ${error}`)
  }

  const data = (await response.json()) as MetaAdsTokenResponse
  if (!data.access_token || typeof data.expires_in !== 'number') {
    throw new Error('Meta Long-lived Token Antwort ist unvollstaendig.')
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
  }
}

export async function getMetaAdsUserProfile(accessToken: string): Promise<{ id: string; name: string }> {
  const params = new URLSearchParams({
    fields: 'id,name',
    access_token: accessToken,
  })

  const response = await fetch(`${META_GRAPH_API}/me?${params.toString()}`)
  if (!response.ok) {
    const error = await response.text().catch(() => '')
    throw new Error(`Meta Profil-Abfrage fehlgeschlagen: ${response.status} ${error}`)
  }

  const data = (await response.json()) as { id?: string; name?: string }
  if (!data.id || !data.name) {
    throw new Error('Meta Profil-Antwort ist unvollstaendig.')
  }

  return { id: data.id, name: data.name }
}

export class MetaAdsTokenExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetaAdsTokenExpiredError'
  }
}
