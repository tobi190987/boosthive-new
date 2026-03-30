import { escapeEmailHtml, renderEmailLayout } from '@/emails/shared'

interface OwnerPastDueEmailProps {
  tenantName: string
  tenantSlug: string
  ownerDashboardUrl: string
}

export function renderOwnerPastDueEmail({
  tenantName,
  tenantSlug,
  ownerDashboardUrl,
}: OwnerPastDueEmailProps) {
  const safeTenantName = escapeEmailHtml(tenantName)
  const safeTenantSlug = escapeEmailHtml(tenantSlug)
  const safeUrl = escapeEmailHtml(ownerDashboardUrl)

  const html = renderEmailLayout({
    tenantName: 'BoostHive',
    preview: `Zahlungsausfall bei Tenant "${tenantName}" (${tenantSlug})`,
    title: 'Tenant-Zahlungsausfall',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
        Der Tenant <strong>${safeTenantName}</strong> (<code>${safeTenantSlug}</code>) hat einen Zahlungsausfall erlitten und befindet sich jetzt im Status <strong>past_due</strong>.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#1f2937;color:#ffffff;text-decoration:none;font-weight:700;">
          Billing-Übersicht öffnen
        </a>
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Falls der Button nicht funktioniert, öffne: <a href="${safeUrl}" style="color:#0f766e;text-decoration:underline;">${safeUrl}</a>
      </p>
    `,
  })

  const text = [
    `Zahlungsausfall bei Tenant "${tenantName}" (${tenantSlug}).`,
    '',
    'Der Tenant befindet sich jetzt im Status past_due.',
    '',
    `Billing-Übersicht: ${ownerDashboardUrl}`,
  ].join('\n')

  return {
    subject: `Zahlungsausfall: ${tenantName} (${tenantSlug})`,
    html,
    text,
  }
}
