import { requireTenantShellContext } from '@/lib/tenant-shell'
import { BrandTrendsWorkspace } from '@/components/brand-trends-workspace'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { ModuleHelpTooltip } from '@/components/module-help-tooltip'
import { MODULE_HELP } from '@/lib/tool-groups'

export default async function BrandTrendsPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('brand_intelligence') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Brand Trends" isAdmin={isAdmin} />
  }

  const help = MODULE_HELP['brand_intelligence']

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              Brand Intelligence
            </h1>
            {help && <ModuleHelpTooltip tagline={help.tagline} features={help.features} />}
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Beobachte Google-Trends, Web-Mentions und Markenstimmung für deine Kunden —
            erkenne Chancen und Krisen früh.
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
      <BrandTrendsWorkspace isAdmin={isAdmin} />
    </>
  )
}
