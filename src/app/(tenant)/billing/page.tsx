import { BillingWorkspace } from '@/components/billing-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { TenantShellHeader } from '@/components/tenant-shell-header'

export default async function BillingPage() {
  const context = await requireTenantShellContext()

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Verwaltung"
        title="Abrechnung"
        description="Dein Abonnement, gebuchte Module und Rechnungen im Überblick."
      />
      <BillingWorkspace tenantSlug={context.tenant.slug} />
    </div>
  )
}
