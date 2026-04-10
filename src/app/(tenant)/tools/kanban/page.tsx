import { KanbanPageClient } from '@/components/kanban-page-client'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { getTenantShellSummary } from '@/lib/tenant-app-data'

export default async function KanbanPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('content_briefs') ||
    context.activeModuleCodes.includes('ad_generator') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Content Workflow" isAdmin={isAdmin} />
  }

  const shellSummary = await getTenantShellSummary(context.tenant.id, context.user.id)
  const openApprovalsCount = shellSummary.openApprovalsCount

  return (
    <>
      <TenantShellHeader
        context={context}
        eyebrow="Content & Kampagnen"
        title="Content Workflow"
        description="Organisiere Briefs, Ad-Texte und Creatives in einem gemeinsamen Workflow. Verschiebe Karten per Drag & Drop zwischen internem Fortschritt, Kundenfreigabe und Abschluss."
      />
      <KanbanPageClient openApprovalsCount={openApprovalsCount} />
    </>
  )
}
