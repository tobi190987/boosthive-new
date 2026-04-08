import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const STATE_TTL_MS = 10 * 60 * 1000

const SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID
  if (!value) throw new Error('GOOGLE_CLIENT_ID ist nicht gesetzt.')
  return value
}

function getClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET
  if (!value) throw new Error('GOOGLE_CLIENT_SECRET ist nicht gesetzt.')
  return value
}

function getStateSecret(): string {
  const value = process.env.GOOGLE_ADS_STATE_SECRET
  if (!value || value.length < 16) {
    throw new Error('GOOGLE_ADS_STATE_SECRET muss als Umgebungsvariable gesetzt sein.')
  }
  return value
}

function getCallbackUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${appUrl}/api/tenant/integrations/google-ads/oauth/callback`
}

export interface GoogleAdsOAuthStatePayload {
  customerId: string
  tenantId: string
  userId: string
  nonce: string
  issuedAt: number
}

export interface GoogleAdsTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

export function generateGoogleAdsNonce(): string {
  return randomBytes(16).toString('hex')
}

export function createGoogleAdsOAuthState(payload: GoogleAdsOAuthStatePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const hmac = createHmac('sha256', getStateSecret()).update(encoded).digest('hex')
  return `${encoded}.${hmac}`
}

export function verifyGoogleAdsOAuthState(state: string): GoogleAdsOAuthStatePayload | null {
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
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as GoogleAdsOAuthStatePayload

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

export function buildGoogleAdsAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getCallbackUrl(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleAdsCodeForTokens(
  code: string
): Promise<GoogleAdsTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getCallbackUrl(),
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text().catch(() => '')
    throw new Error(`Google-Ads Token-Exchange fehlgeschlagen: ${response.status} ${error}`)
  }

  return response.json() as Promise<GoogleAdsTokenResponse>
}

export async function refreshGoogleAdsAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const status = response.status
    const error = await response.text().catch(() => '')

    if (status === 400 || status === 401) {
      const parsed = parseOAuthErrorCode(error)
      if (parsed === 'invalid_grant') {
        throw new GoogleAdsTokenRevokedError(
          'Google-Ads Refresh-Token wurde von Google widerrufen.'
        )
      }
    }

    throw new Error(`Google-Ads Token-Refresh fehlgeschlagen: ${status} ${error}`)
  }

  return response.json() as Promise<{ access_token: string; expires_in: number }>
}

function parseOAuthErrorCode(errorText: string): string | null {
  try {
    const parsed = JSON.parse(errorText) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : null
  } catch {
    return null
  }
}

export async function getGoogleAdsGoogleEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Google UserInfo Abfrage fehlgeschlagen: ${response.status}`)
  }

  const data = (await response.json()) as { email?: string }
  if (!data.email) throw new Error('Google UserInfo Antwort ist unvollstaendig.')
  return data.email
}

export class GoogleAdsTokenRevokedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleAdsTokenRevokedError'
  }
}
