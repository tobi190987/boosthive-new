import { KanbanWorkspace } from '@/components/kanban-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function KanbanPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('content_briefs') ||
    context.activeModuleCodes.includes('ad_generator') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Kanban Board" isAdmin={isAdmin} />
  }

  return (
    <>
      <TenantShellHeader
        context={context}
        eyebrow="Content & Kampagnen"
        title="Kanban Board"
        description="Organisiere Briefs, Ad-Texte und Creatives in einem gemeinsamen Workflow. Verschiebe Karten per Drag & Drop zwischen internem Fortschritt, Kundenfreigabe und Abschluss."
      />
      <KanbanWorkspace />
    </>
  )
}
