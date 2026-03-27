import crypto from 'crypto'
import type { NextRequest } from 'next/server'

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

export function createPasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashPasswordResetToken(rawToken)
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

  return { rawToken, tokenHash, expiresAt }
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function buildPasswordResetUrl(request: NextRequest, rawToken: string): string {
  const host = request.headers.get('host')
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'

  if (!host) {
    throw new Error('Host-Header fehlt für Reset-URL.')
  }

  const url = new URL(`${protocol}://${host}/reset-password`)
  url.searchParams.set('token', rawToken)
  return url.toString()
}
