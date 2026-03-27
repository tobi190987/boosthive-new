function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

interface EmailLayoutProps {
  tenantName: string
  preview: string
  title: string
  bodyHtml: string
}

export function renderEmailLayout({
  tenantName,
  preview,
  title,
  bodyHtml,
}: EmailLayoutProps): string {
  return `
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:0;background:#eef6f7;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
          ${escapeHtml(preview)}
        </div>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background:#eef6f7;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;">
                <tr>
                  <td style="padding:32px;background:linear-gradient(135deg,#0f172a,#164e63);color:#f8fafc;">
                    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#67e8f9;">BoostHive</p>
                    <h1 style="margin:0;font-size:28px;line-height:1.2;">${escapeHtml(tenantName)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 12px;">
                    <h2 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#0f172a;">${escapeHtml(title)}</h2>
                    ${bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 32px 32px;font-size:13px;line-height:1.6;color:#475569;">
                    <p style="margin:0;">Diese Nachricht wurde für ${escapeHtml(tenantName)} über BoostHive versendet.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim()
}

export function escapeEmailHtml(value: string): string {
  return escapeHtml(value)
}
