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
  const subject = `${tenantName} via BoostHive: Passwort zurücksetzen`

  const html = renderEmailLayout({
    tenantName,
    preview: `Setze dein Passwort für ${tenantName} zurück.`,
    title: 'Passwort zurücksetzen',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
        Für dein Konto wurde ein Link zum Zurücksetzen des Passworts angefordert. Wenn du das warst, kannst du über den Button unten ein neues Passwort vergeben.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeEmailHtml(resetUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">
          Passwort zurücksetzen
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
        Der Link ist ${expiresInHours} Stunde${expiresInHours === 1 ? '' : 'n'} gültig und funktioniert nur auf der richtigen Tenant-Subdomain.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
        <a href="${escapeEmailHtml(resetUrl)}" style="color:#0f766e;text-decoration:underline;">${escapeEmailHtml(resetUrl)}</a>
      </p>
    `,
  })

  const text = [
    `Passwort zurücksetzen für ${tenantName}`,
    '',
    'Es wurde ein Link zum Zurücksetzen deines Passworts angefordert.',
    `Der Link ist ${expiresInHours} Stunde${expiresInHours === 1 ? '' : 'n'} gültig:`,
    resetUrl,
  ].join('\n')

  return { subject, html, text }
}
