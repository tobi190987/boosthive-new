import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface InvitationEmailTemplateProps {
  tenantName: string
  invitationUrl: string
  invitedByName: string
}

export function renderInvitationEmail({
  tenantName,
  invitationUrl,
  invitedByName,
}: InvitationEmailTemplateProps) {
  const safeInvitationUrl = escapeEmailHtml(invitationUrl)

  const html = renderEmailLayout({
    tenantName,
    preview: `${invitedByName} hat dich zu ${tenantName} eingeladen.`,
    title: 'Einladung zu deinem Workspace',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
        <strong>${escapeEmailHtml(invitedByName)}</strong> hat dich zu <strong>${escapeEmailHtml(tenantName)}</strong> eingeladen.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${safeInvitationUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">
          Einladung annehmen
        </a>
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Wenn du diese Einladung nicht erwartest, kannst du sie ignorieren.
      </p>
    `,
  })

  const text = [
    `${invitedByName} hat dich zu ${tenantName} eingeladen.`,
    '',
    'Nimm die Einladung hier an:',
    invitationUrl,
  ].join('\n')

  return {
    subject: `Einladung zu ${tenantName}`,
    html,
    text,
  }
}
