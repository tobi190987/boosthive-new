import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface RenderApprovalDecisionEmailParams {
  tenantName: string
  customerName: string
  contentTitle: string
  contentTypeLabel: string
  decision: 'approved' | 'changes_requested'
  feedback?: string | null
  contentUrl: string
}

export function renderApprovalDecisionEmail({
  tenantName,
  customerName,
  contentTitle,
  contentTypeLabel,
  decision,
  feedback,
  contentUrl,
}: RenderApprovalDecisionEmailParams) {
  const isApproved = decision === 'approved'
  const subject = isApproved
    ? `${customerName} hat ${contentTypeLabel} freigegeben`
    : `${customerName} hat Korrekturen für ${contentTypeLabel} angefragt`
  const preview = isApproved
    ? `${customerName} hat ${contentTitle} freigegeben.`
    : `${customerName} hat Korrekturwünsche zu ${contentTitle} hinterlassen.`
  const title = isApproved ? 'Freigabe erhalten' : 'Korrekturwunsch erhalten'

  const feedbackBlock =
    !isApproved && feedback?.trim()
      ? `
        <div style="margin:24px 0;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Feedback des Kunden</p>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">${escapeEmailHtml(feedback.trim()).replaceAll('\n', '<br />')}</p>
        </div>
      `
      : ''

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
      ${escapeEmailHtml(customerName)} hat dein ${escapeEmailHtml(contentTypeLabel)} <strong>${escapeEmailHtml(contentTitle)}</strong>
      ${isApproved ? 'freigegeben.' : 'geprüft und Korrekturen angefragt.'}
    </p>
    ${feedbackBlock}
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
      Öffne den Eintrag in BoostHive, um direkt weiterzuarbeiten.
    </p>
    <a href="${contentUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">
      Eintrag öffnen
    </a>
  `

  const text = [
    `${customerName} hat dein ${contentTypeLabel} "${contentTitle}" ${isApproved ? 'freigegeben' : 'geprüft und Korrekturen angefragt'}.`,
    feedback?.trim() ? '' : '',
    feedback?.trim() ? `Feedback: ${feedback.trim()}` : '',
    `Eintrag öffnen: ${contentUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  const html = renderEmailLayout({
    tenantName,
    preview,
    title,
    bodyHtml,
  })

  return { subject, html, text }
}
