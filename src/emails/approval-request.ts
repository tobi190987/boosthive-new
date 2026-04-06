import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface RenderApprovalRequestEmailParams {
  tenantName: string
  customerName: string
  contentTitle: string
  contentTypeLabel: string
  approvalLink: string
}

export function renderApprovalRequestEmail({
  tenantName,
  customerName,
  contentTitle,
  contentTypeLabel,
  approvalLink,
}: RenderApprovalRequestEmailParams) {
  const subject = `${tenantName} bittet um Ihre Freigabe: ${contentTitle}`
  const preview = `Bitte prüfen Sie ${contentTypeLabel}: ${contentTitle}`
  const title = 'Freigabe erforderlich'

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
      Guten Tag${customerName ? ` ${escapeEmailHtml(customerName)}` : ''},
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      ${escapeEmailHtml(tenantName)} hat folgenden ${escapeEmailHtml(contentTypeLabel)} zur Freigabe bereitgestellt:
    </p>
    <div style="margin:24px 0;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${escapeEmailHtml(contentTypeLabel)}</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${escapeEmailHtml(contentTitle)}</p>
    </div>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
      Bitte prüfen Sie den Inhalt und teilen Sie uns Ihre Entscheidung mit.
    </p>
    <a href="${approvalLink}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">
      Jetzt prüfen &amp; freigeben
    </a>
  `

  const text = [
    `Guten Tag${customerName ? ` ${customerName}` : ''},`,
    '',
    `${tenantName} hat ${contentTypeLabel} "${contentTitle}" zur Freigabe bereitgestellt.`,
    '',
    `Jetzt prüfen: ${approvalLink}`,
  ].join('\n')

  const html = renderEmailLayout({ tenantName, preview, title, bodyHtml })

  return { subject, html, text }
}
