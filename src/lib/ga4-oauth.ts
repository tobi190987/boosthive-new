/**
 * PROJ-50: Google Analytics 4 OAuth 2.0 helpers.
 *
 * Reuses the same pattern as GSC OAuth (PROJ-26) but with GA4-specific scopes.
 * Uses the same Google Client ID/Secret since GA4 + GSC are both Google APIs.
 * Separate state secret for CSRF protection.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID
  if (!id) throw new Error('GOOGLE_CLIENT_ID ist nicht gesetzt.')
  return id
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET ist nicht gesetzt.')
  return secret
}

function getStateSecret(): string {
  const secret = process.env.GA4_STATE_SECRET ?? process.env.GSC_STATE_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'GA4_STATE_SECRET oder GSC_STATE_SECRET muss als Umgebungsvariable gesetzt sein (mindestens 16 Zeichen).'
    )
  }
  return secret
}

function getCallbackUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  // Reuse the already registered central Google callback route to avoid
  // requiring a second redirect URI in the Google OAuth client.
  return `${appUrl}/api/gsc/callback`
}

// ---------------------------------------------------------------------------
// State (CSRF protection)
// ---------------------------------------------------------------------------

export interface GA4OAuthStatePayload {
  customerId: string
  tenantId: string
  userId: string
  nonce: string
  issuedAt: number
}

/**
 * Creates a signed state parameter for the GA4 OAuth flow.
 * Format: base64(json payload).hmac
 */
export function createGA4OAuthState(payload: GA4OAuthStatePayload): string {
  const json = JSON.stringify(payload)
  const encoded = Buffer.from(json).toString('base64url')
  const hmac = createHmac('sha256', getStateSecret()).update(encoded).digest('hex')
  return `${encoded}.${hmac}`
}

/**
 * Verifies and decodes the state parameter from the GA4 OAuth callback.
 * Returns null if the signature is invalid or expired.
 */
export function verifyGA4OAuthState(state: string): GA4OAuthStatePayload | null {
  const dotIndex = state.lastIndexOf('.')
  if (dotIndex === -1) return null

  const encoded = state.substring(0, dotIndex)
  const receivedHmac = state.substring(dotIndex + 1)

  const expectedHmac = createHmac('sha256', getStateSecret()).update(encoded).digest('hex')
  const receivedBuffer = Buffer.from(receivedHmac, 'hex')
  const expectedBuffer = Buffer.from(expectedHmac, 'hex')

  if (receivedBuffer.length === 0 || receivedBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) return null

  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8')
    const payload = JSON.parse(json) as GA4OAuthStatePayload

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

/**
 * Generates a cryptographically random nonce for the state parameter.
 */
export function generateGA4Nonce(): string {
  return randomBytes(16).toString('hex')
}

// ---------------------------------------------------------------------------
// OAuth Authorization URL
// ---------------------------------------------------------------------------

/**
 * Builds the Google OAuth authorization URL for GA4 scopes.
 */
export function buildGA4AuthorizationUrl(state: string): string {
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

// ---------------------------------------------------------------------------
// Token Exchange
// ---------------------------------------------------------------------------

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 */
export async function exchangeGA4CodeForTokens(code: string): Promise<GoogleTokenResponse> {
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
    const error = await response.text()
    throw new Error(`GA4 Token-Exchange fehlgeschlagen: ${response.status} ${error}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

/**
 * Refreshes an expired access token using the refresh token.
 */
export async function refreshGA4AccessToken(
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
    const error = await response.text()

    if (status === 400 || status === 401) {
      const parsed = parseOAuthErrorCode(error)
      if (parsed === 'invalid_grant') {
        throw new GA4TokenRevokedError('GA4 Refresh-Token wurde von Google widerrufen.')
      }
    }

    throw new Error(`GA4 Token-Refresh fehlgeschlagen: ${status} ${error}`)
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

// ---------------------------------------------------------------------------
// Custom error for revoked tokens
// ---------------------------------------------------------------------------

export class GA4TokenRevokedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GA4TokenRevokedError'
  }
}

// ---------------------------------------------------------------------------
// Google User Info
// ---------------------------------------------------------------------------

/**
 * Fetches the Google account email for the authenticated user.
 */
export async function getGA4GoogleEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Google UserInfo Abfrage fehlgeschlagen: ${response.status}`)
  }

  const data = (await response.json()) as { email: string }
  return data.email
}
