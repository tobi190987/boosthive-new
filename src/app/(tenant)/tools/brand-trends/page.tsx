import { requireTenantShellContext } from '@/lib/tenant-shell'
import { BrandTrendsWorkspace } from '@/components/brand-trends-workspace'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { ModuleLockedCard } from '@/components/module-locked-card'

export default async function BrandTrendsPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('brand_intelligence') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Brand Trends" isAdmin={isAdmin} />
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Brand Trends
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Beobachte Google-Trends-Verläufe und verwandte Suchanfragen für deine
            Kunden-Marken.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <div className="w-full sm:w-[280px]">
            <CustomerSelectorDropdown
              className="mx-0 my-0 w-full"
              triggerClassName="mx-0 my-0 w-full"
              compact
            />
          </div>
        </div>
      </div>
      <BrandTrendsWorkspace />
    </>
  )
}
