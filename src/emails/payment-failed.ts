import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface PaymentFailedEmailProps {
  tenantName: string
  billingUrl: string
}

export function renderPaymentFailedEmail({
  tenantName,
  billingUrl,
}: PaymentFailedEmailProps) {
  const safeTenantName = escapeEmailHtml(tenantName)
  const safeBillingUrl = escapeEmailHtml(billingUrl)

  const html = renderEmailLayout({
    tenantName,
    preview: `Zahlung fehlgeschlagen für ${tenantName}. Bitte aktualisiere deine Zahlungsmethode.`,
    title: 'Zahlung fehlgeschlagen',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
        Die Zahlung für dein Basis-Abo bei <strong>${safeTenantName}</strong> ist fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode, damit dein Zugang nicht unterbrochen wird.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${safeBillingUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;">
          Zahlungsmethode aktualisieren
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
        Falls du keine Maßnahmen ergreifst, wird dein Zugang nach der Grace Period gesperrt.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Falls der Button nicht funktioniert, öffne: <a href="${safeBillingUrl}" style="color:#0f766e;text-decoration:underline;">${safeBillingUrl}</a>
      </p>
    `,
  })

  const text = [
    `Zahlung fehlgeschlagen für ${tenantName}.`,
    '',
    'Bitte aktualisiere deine Zahlungsmethode, damit dein Zugang nicht gesperrt wird:',
    billingUrl,
  ].join('\n')

  return {
    subject: `Zahlung fehlgeschlagen – ${tenantName}`,
    html,
    text,
  }
}
