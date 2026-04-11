import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface RenderExportDeliveryEmailParams {
  tenantName: string
  recipientName?: string
  exportTypeLabel: string
  formatLabel: string
  customMessage?: string | null
}

export function renderExportDeliveryEmail({
  tenantName,
  recipientName,
  exportTypeLabel,
  formatLabel,
  customMessage,
}: RenderExportDeliveryEmailParams) {
  const subject = `${tenantName}: ${exportTypeLabel} (${formatLabel})`
  const preview = `${tenantName} hat Ihnen einen Bericht als ${formatLabel} gesendet.`
  const title = 'Ihr Bericht ist da'

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
      ${recipientName ? `Guten Tag ${escapeEmailHtml(recipientName)},` : 'Guten Tag,'}
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      ${escapeEmailHtml(tenantName)} hat Ihnen folgenden Bericht zugeschickt:
    </p>
    <div style="margin:24px 0;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Bericht</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${escapeEmailHtml(exportTypeLabel)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Format: ${escapeEmailHtml(formatLabel)}</p>
    </div>
    ${
      customMessage
        ? `<div style="margin:0 0 24px;padding:14px 16px;border-left:3px solid #e2e8f0;background:#f8fafc;border-radius:0 8px 8px 0;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;white-space:pre-line;">${escapeEmailHtml(customMessage)}</p>
    </div>`
        : ''
    }
    <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">
      Der Bericht ist als Anhang dieser E-Mail beigefügt.
    </p>
  `

  const text = [
    `${recipientName ? `Guten Tag ${recipientName},` : 'Guten Tag,'}`,
    '',
    `${tenantName} hat Ihnen den Bericht "${exportTypeLabel}" (${formatLabel}) zugesendet.`,
    ...(customMessage ? ['', customMessage] : []),
    '',
    'Der Bericht ist als Anhang dieser E-Mail beigefügt.',
  ].join('\n')

  const html = renderEmailLayout({ tenantName, preview, title, bodyHtml })

  return { subject, html, text }
}
