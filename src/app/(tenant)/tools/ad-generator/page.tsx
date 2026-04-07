import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AdGeneratorWorkspace } from '@/components/ad-generator-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { TenantShellHeader } from '@/components/tenant-shell-header'

export default async function AdGeneratorPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('ad_generator') || context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Ad Generator" isAdmin={isAdmin} />
  }

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Content & Kampagnen"
        title="Ad Generator"
        description="KI-gestützte Anzeigentexte für Facebook, LinkedIn, TikTok und Google Ads — in Sekunden."
      />
      <AdGeneratorWorkspace />
    </div>
  )
}
