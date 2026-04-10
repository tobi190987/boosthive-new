import { BillingWorkspace } from '@/components/billing-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function BillingPage() {
  const context = await requireTenantShellContext()

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Abrechnung</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Dein Abonnement, gebuchte Module und Rechnungen im Überblick.
        </p>
      </div>
      <BillingWorkspace tenantSlug={context.tenant.slug} />
    </>
  )
}
