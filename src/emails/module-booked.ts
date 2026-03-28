import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface ModuleBookedEmailProps {
  tenantName: string
  moduleName: string
  moduleDescription: string
  priceFormatted: string
  billingUrl: string
  bookedAt: string
}

export function renderModuleBookedEmail({
  tenantName,
  moduleName,
  moduleDescription,
  priceFormatted,
  billingUrl,
  bookedAt,
}: ModuleBookedEmailProps) {
  const safeTenantName = escapeEmailHtml(tenantName)
  const safeModuleName = escapeEmailHtml(moduleName)
  const safeModuleDescription = escapeEmailHtml(moduleDescription)
  const safePriceFormatted = escapeEmailHtml(priceFormatted)
  const safeBillingUrl = escapeEmailHtml(billingUrl)
  const safeBookedAt = escapeEmailHtml(bookedAt)

  const html = renderEmailLayout({
    tenantName,
    preview: `Modul „${moduleName}" wurde erfolgreich gebucht.`,
    title: 'Modul gebucht',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
        Das Modul <strong>${safeModuleName}</strong> wurde erfolgreich für <strong>${safeTenantName}</strong> gebucht.
      </p>

      <table role="presentation" width="100%" cellPadding="0" cellSpacing="0"
        style="margin:0 0 24px;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;background:#f8fafc;">
            <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">Gebuchtes Modul</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${safeModuleName}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#475569;">${safeModuleDescription}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #e2e8f0;">
            <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
              <tr>
                <td style="font-size:14px;color:#64748b;">Preis</td>
                <td align="right" style="font-size:14px;font-weight:600;color:#0f172a;">${safePriceFormatted} / 4 Wochen</td>
              </tr>
              <tr>
                <td style="font-size:14px;color:#64748b;padding-top:8px;">Buchungsdatum</td>
                <td align="right" style="font-size:14px;color:#0f172a;padding-top:8px;">${safeBookedAt}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
        Der anteilige Betrag wird zu deiner nächsten Rechnung hinzugefügt.
        Du kannst deine Buchungen jederzeit in der Abrechnung verwalten.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${safeBillingUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#1f2937;color:#ffffff;text-decoration:none;font-weight:700;">
          Zur Abrechnung
        </a>
      </p>
    `,
  })

  const text = [
    `Modul „${moduleName}" erfolgreich gebucht für ${tenantName}.`,
    '',
    `Preis: ${priceFormatted} / 4 Wochen`,
    `Buchungsdatum: ${bookedAt}`,
    '',
    'Der anteilige Betrag wird zu deiner nächsten Rechnung hinzugefügt.',
    '',
    `Zur Abrechnung: ${billingUrl}`,
  ].join('\n')

  return {
    subject: `Modul gebucht: ${moduleName} – ${tenantName}`,
    html,
    text,
  }
}
