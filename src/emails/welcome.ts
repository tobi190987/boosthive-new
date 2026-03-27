import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface WelcomeEmailTemplateProps {
  tenantName: string
  loginUrl: string
  setupUrl: string
}

export function renderWelcomeEmail({
  tenantName,
  loginUrl,
  setupUrl,
}: WelcomeEmailTemplateProps) {
  const safeTenantName = escapeEmailHtml(tenantName)
  const safeLoginUrl = escapeEmailHtml(loginUrl)
  const safeSetupUrl = escapeEmailHtml(setupUrl)

  const html = renderEmailLayout({
    tenantName,
    preview: `Willkommen bei ${tenantName}. Richte dein Passwort ein und melde dich an.`,
    title: 'Willkommen in deinem Workspace',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
        Dein Workspace <strong>${safeTenantName}</strong> ist jetzt bereit. Richte als naechstes dein Passwort ein und melde dich danach direkt an.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${safeSetupUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">
          Passwort festlegen
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
        Login-URL: <a href="${safeLoginUrl}" style="color:#0f766e;text-decoration:underline;">${safeLoginUrl}</a>
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
        <a href="${safeSetupUrl}" style="color:#0f766e;text-decoration:underline;">${safeSetupUrl}</a>
      </p>
    `,
  })

  const text = [
    `Willkommen bei ${tenantName}.`,
    '',
    'Dein Workspace ist bereit. Richte zuerst dein Passwort ein:',
    setupUrl,
    '',
    'Danach kannst du dich hier anmelden:',
    loginUrl,
  ].join('\n')

  return {
    subject: `Willkommen bei ${tenantName}`,
    html,
    text,
  }
}
