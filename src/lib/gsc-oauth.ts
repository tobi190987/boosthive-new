/**
 * PROJ-26: Google Search Console OAuth 2.0 helpers.
 *
 * Uses direct fetch() calls instead of googleapis package.
 * Handles authorization URL generation, token exchange, token refresh,
 * and Search Console API calls.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3'
const STATE_TTL_MS = 10 * 60 * 1000

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
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
  const secret = process.env.GSC_STATE_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('GSC_STATE_SECRET muss als Umgebungsvariable gesetzt sein (mindestens 16 Zeichen).')
  }
  return secret
}

function getCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL
    : 'http://localhost:3000'

  // Use the central callback route
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${appUrl}/api/gsc/callback`
}

// ---------------------------------------------------------------------------
// State (CSRF protection)
// ---------------------------------------------------------------------------

export interface OAuthStatePayload {
  projectId: string
  tenantId: string
  userId: string
  nonce: string
  issuedAt: number
}

/**
 * Creates a signed state parameter for the OAuth flow.
 * Format: base64(json payload):hmac
 */
export function createOAuthState(payload: OAuthStatePayload): string {
  const json = JSON.stringify(payload)
  const encoded = Buffer.from(json).toString('base64url')
  const hmac = createHmac('sha256', getStateSecret()).update(encoded).digest('hex')
  return `${encoded}.${hmac}`
}

/**
 * Verifies and decodes the state parameter from the OAuth callback.
 * Returns null if the signature is invalid.
 */
export function verifyOAuthState(state: string): OAuthStatePayload | null {
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
    const payload = JSON.parse(json) as OAuthStatePayload

    if (
      typeof payload.projectId !== 'string' ||
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
export function generateNonce(): string {
  return randomBytes(16).toString('hex')
}

export function getOAuthNonceCookieName(nonce: string): string {
  return `gsc_oauth_${nonce}`
}

// ---------------------------------------------------------------------------
// OAuth Authorization URL
// ---------------------------------------------------------------------------

/**
 * Builds the Google OAuth authorization URL.
 */
export function buildAuthorizationUrl(state: string): string {
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
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
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
    throw new Error(`Token-Exchange fehlgeschlagen: ${response.status} ${error}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

/**
 * Refreshes an expired access token using the refresh token.
 */
export async function refreshAccessToken(
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

    // 400/401 with invalid_grant means the refresh token was revoked
    if (status === 400 || status === 401) {
      const parsed = parseOAuthErrorCode(error)
      if (parsed === 'invalid_grant') {
        throw new TokenRevokedError('Refresh-Token wurde von Google widerrufen.')
      }
    }

    throw new Error(`Token-Refresh fehlgeschlagen: ${status} ${error}`)
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

export class TokenRevokedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenRevokedError'
  }
}

// ---------------------------------------------------------------------------
// Google User Info
// ---------------------------------------------------------------------------

/**
 * Fetches the Google account email for the authenticated user.
 */
export async function getGoogleEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Google UserInfo Abfrage fehlgeschlagen: ${response.status}`)
  }

  const data = (await response.json()) as { email: string }
  return data.email
}

// ---------------------------------------------------------------------------
// Google Search Console API
// ---------------------------------------------------------------------------

export interface GscSiteEntry {
  siteUrl: string
  permissionLevel: string
}

export interface GscSearchAnalyticsRow {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

/**
 * Lists all verified sites/properties from Google Search Console.
 */
export async function listGscProperties(accessToken: string): Promise<GscSiteEntry[]> {
  const response = await fetch(`${GSC_API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new TokenRevokedError('Access-Token abgelaufen oder widerrufen.')
    }
    throw new Error(`GSC Sites-Abfrage fehlgeschlagen: ${response.status}`)
  }

  const data = (await response.json()) as { siteEntry?: GscSiteEntry[] }
  return (data.siteEntry ?? [])
    .filter((entry) => typeof entry.siteUrl === 'string' && entry.siteUrl.length > 0)
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))
}

export interface SearchAnalyticsQueryInput {
  siteUrl: string
  startDate: string
  endDate: string
  dimensions?: string[]
  rowLimit?: number
  country?: string
  query?: string
}

export async function querySearchAnalytics(
  accessToken: string,
  input: SearchAnalyticsQueryInput
): Promise<GscSearchAnalyticsRow[]> {
  const body: Record<string, unknown> = {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: input.dimensions ?? ['page'],
    rowLimit: input.rowLimit ?? 25,
    dataState: 'final',
  }

  const dimensionFilterGroups: Array<{
    groupType: 'and'
    filters: Array<{
      dimension: string
      operator: 'equals'
      expression: string
    }>
  }> = []

  const filters: Array<{
    dimension: string
    operator: 'equals'
    expression: string
  }> = []

  if (input.query) {
    filters.push({
      dimension: 'query',
      operator: 'equals',
      expression: input.query,
    })
  }

  if (input.country) {
    filters.push({
      dimension: 'country',
      operator: 'equals',
      expression: input.country,
    })
  }

  if (filters.length > 0) {
    dimensionFilterGroups.push({
      groupType: 'and',
      filters,
    })
  }

  if (dimensionFilterGroups.length > 0) {
    body.dimensionFilterGroups = dimensionFilterGroups
  }

  const response = await fetch(
    `${GSC_API_BASE}/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    if (response.status === 401) {
      throw new TokenRevokedError('Access-Token abgelaufen oder widerrufen.')
    }

    const errorText = await response.text().catch(() => '')
    throw new Error(`GSC Search Analytics Abfrage fehlgeschlagen: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as { rows?: GscSearchAnalyticsRow[] }
  return data.rows ?? []
}
