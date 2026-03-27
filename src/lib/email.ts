import crypto from 'crypto'
import { renderInvitationEmail } from '@/emails/invitation'
import { renderPasswordResetEmail } from '@/emails/password-reset'
import { renderWelcomeEmail } from '@/emails/welcome'

interface SendPasswordResetOptions {
  to: string
  tenantName: string
  tenantSlug: string
  resetUrl: string
  token?: string
  expiresInHours?: number
}

interface SendWelcomeOptions {
  to: string
  tenantName: string
  tenantSlug: string
  setupUrl: string
}

interface SendInvitationOptions {
  to: string
  tenantName: string
  tenantSlug: string
  invitationUrl: string
  invitedByName: string
  token?: string
}

type MailtrapMode = 'live' | 'sandbox'

interface MailtrapAddress {
  email: string
  name?: string
}

interface MailtrapConfig {
  apiToken: string
  fromEmail: string
  mode: MailtrapMode
  inboxId?: string
}

interface SendEmailOptions {
  to: string
  tenantName: string
  tenantSlug: string
  subject: string
  html: string
  text: string
  category: string
  tokenForLogs?: string
}

function hashRecipientForLogs(email: string): string {
  return hashForLogs(email.trim().toLowerCase())
}

function getMailtrapConfig(): MailtrapConfig | null {
  const apiToken = process.env.MAILTRAP_API_TOKEN
  const fromEmail = process.env.MAILTRAP_FROM
  const rawMode = process.env.MAILTRAP_MODE?.toLowerCase()
  const mode: MailtrapMode = rawMode === 'sandbox' ? 'sandbox' : 'live'
  const inboxId = process.env.MAILTRAP_INBOX_ID

  if (!apiToken || !fromEmail) {
    return null
  }

  if (mode === 'sandbox' && !inboxId) {
    console.error('[email] MAILTRAP_INBOX_ID fehlt für MAILTRAP_MODE=sandbox.')
    return null
  }

  return {
    apiToken,
    fromEmail,
    mode,
    inboxId,
  }
}

function getTenantOrigin(slug: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'boost-hive.de'
  const localDomain = process.env.LOCAL_DOMAIN || 'localhost'
  const isLocal = process.env.NODE_ENV !== 'production'

  if (isLocal) {
    return `http://${slug}.${localDomain}:3000`
  }

  return `https://${slug}.${rootDomain}`
}

function hashForLogs(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export function buildTenantUrl(slug: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getTenantOrigin(slug)}${normalizedPath}`
}

async function sendEmail({
  to,
  tenantName,
  tenantSlug,
  subject,
  html,
  text,
  category,
  tokenForLogs,
}: SendEmailOptions): Promise<void> {
  const config = getMailtrapConfig()

  if (!config) {
    console.warn('[email] Versand übersprungen, Mailtrap ist nicht konfiguriert.', {
      subject,
      category,
      recipientHash: hashRecipientForLogs(to),
    })
    return
  }

  const sendUrl =
    config.mode === 'sandbox'
      ? `https://sandbox.api.mailtrap.io/api/send/${config.inboxId}`
      : 'https://send.api.mailtrap.io/api/send'

  const payload = {
    from: {
      email: config.fromEmail,
      name: `${tenantName} via BoostHive`,
    } satisfies MailtrapAddress,
    to: [{ email: to }] satisfies MailtrapAddress[],
    subject,
    text,
    html,
    category,
    custom_variables: {
      tenant_slug: tenantSlug,
    },
  }

  const response = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('[email] Mailtrap-Versand fehlgeschlagen:', {
      status: response.status,
      subject,
      category,
      recipientHash: hashRecipientForLogs(to),
      tokenHash: tokenForLogs ? hashForLogs(tokenForLogs) : undefined,
      body: body.slice(0, 400),
    })
    throw new Error('Transactional email could not be sent.')
  }
}

export async function sendWelcome({
  to,
  tenantName,
  tenantSlug,
  setupUrl,
}: SendWelcomeOptions): Promise<void> {
  const { subject, html, text } = renderWelcomeEmail({
    tenantName,
    loginUrl: buildTenantUrl(tenantSlug, '/login'),
    setupUrl,
  })

  await sendEmail({
    to,
    tenantName,
    tenantSlug,
    subject,
    html,
    text,
    category: 'welcome',
  })
}

export async function sendPasswordReset({
  to,
  tenantName,
  tenantSlug,
  resetUrl,
  token,
  expiresInHours = 1,
}: SendPasswordResetOptions): Promise<void> {
  const { subject, html, text } = renderPasswordResetEmail({
    tenantName,
    resetUrl,
    expiresInHours,
  })

  await sendEmail({
    to,
    tenantName,
    tenantSlug,
    subject,
    html,
    text,
    category: 'password-reset',
    tokenForLogs: token,
  })
}

export async function sendInvitation({
  to,
  tenantName,
  tenantSlug,
  invitationUrl,
  invitedByName,
  token,
}: SendInvitationOptions): Promise<void> {
  const { subject, html, text } = renderInvitationEmail({
    tenantName,
    invitationUrl,
    invitedByName,
  })

  await sendEmail({
    to,
    tenantName,
    tenantSlug,
    subject,
    html,
    text,
    category: 'invitation',
    tokenForLogs: token,
  })
}
