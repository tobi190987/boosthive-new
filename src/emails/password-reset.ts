import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface PasswordResetEmailInput {
  tenantName: string
  resetUrl: string
  expiresInHours: number
}

export function renderPasswordResetEmail({
  tenantName,
  resetUrl,
  expiresInHours,
}: PasswordResetEmailInput) {
  const subject = `${tenantName} via BoostHive: Passwort zuruecksetzen`

  const html = renderEmailLayout({
    tenantName,
    preview: `Setze dein Passwort fuer ${tenantName} zurueck.`,
    title: 'Passwort zuruecksetzen',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
        Fuer dein Konto wurde ein Link zum Zuruecksetzen des Passworts angefordert. Wenn du das warst, kannst du ueber den Button unten ein neues Passwort vergeben.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeEmailHtml(resetUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">
          Passwort zuruecksetzen
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
        Der Link ist ${expiresInHours} Stunde${expiresInHours === 1 ? '' : 'n'} gueltig und funktioniert nur auf der richtigen Tenant-Subdomain.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
        <a href="${escapeEmailHtml(resetUrl)}" style="color:#0f766e;text-decoration:underline;">${escapeEmailHtml(resetUrl)}</a>
      </p>
    `,
  })

  const text = [
    `Passwort zuruecksetzen fuer ${tenantName}`,
    '',
    'Es wurde ein Link zum Zuruecksetzen deines Passworts angefordert.',
    `Der Link ist ${expiresInHours} Stunde${expiresInHours === 1 ? '' : 'n'} gueltig:`,
    resetUrl,
  ].join('\n')

  return { subject, html, text }
}
