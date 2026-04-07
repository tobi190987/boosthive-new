import { AdsLibraryWorkspace } from '@/components/ads-library-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function AdsLibraryPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('ad_generator') || context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Ads Bibliothek" isAdmin={isAdmin} />
  }

  return (
    <>
      <TenantShellHeader
        context={context}
        eyebrow="Content & Kampagnen"
        title="Ads Bibliothek"
        description="Speichere Bild- und Videoanzeigen je Kunde und vergleiche Formate direkt in einer proportional skalierten Übersicht."
      />
      <AdsLibraryWorkspace isAdmin={isAdmin} />
    </>
  )
}
