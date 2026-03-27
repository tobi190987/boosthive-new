import crypto from 'crypto'
import { buildTenantUrl } from '@/lib/email'

const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type InvitationStatus = 'pending' | 'accepted' | 'revoked'

export function createInvitationToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashInvitationToken(rawToken)
  const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_MS)

  return { rawToken, tokenHash, expiresAt }
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function buildInvitationUrl(tenantSlug: string, rawToken: string): string {
  const invitationUrl = new URL(buildTenantUrl(tenantSlug, '/accept-invite'))
  invitationUrl.searchParams.set('token', rawToken)
  return invitationUrl.toString()
}

export function deriveInvitationStatus(invitation: {
  accepted_at?: string | null
  revoked_at?: string | null
  expires_at?: string | null
}): InvitationStatus {
  if (invitation.accepted_at) {
    return 'accepted'
  }

  if (invitation.revoked_at) {
    return 'revoked'
  }

  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
    return 'revoked'
  }

  return 'pending'
}
