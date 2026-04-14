import { requireTenantShellContext } from '@/lib/tenant-shell'
import { BrandTrendsWorkspace } from '@/components/brand-trends-workspace'
import { CustomerSelectorDropdown } from '@/components/customer-selector-dropdown'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { TenantShellHeader } from '@/components/tenant-shell-header'
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
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Analyse & SEO"
        title="Brand Intelligence"
        description="Beobachte Google-Trends, Web-Mentions und Markenstimmung für deine Kunden — erkenne Chancen und Krisen früh."
        features={help?.features}
      />
      <div className="flex justify-end">
        <div className="w-full sm:w-[280px]">
          <CustomerSelectorDropdown
            className="mx-0 my-0 w-full"
            triggerClassName="mx-0 my-0 w-full"
            compact
          />
        </div>
      </div>
      <BrandTrendsWorkspace isAdmin={isAdmin} />
    </div>
  )
}
