import Link from 'next/link'
import { ApprovalsWorkspace } from '@/components/approvals-workspace'
import { KanbanWorkspace } from '@/components/kanban-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { cn } from '@/lib/utils'

export default async function KanbanPage({
  searchParams,
}: {
  searchParams?: { tab?: string }
}) {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('content_briefs') ||
    context.activeModuleCodes.includes('ad_generator') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Kanban Board" isAdmin={isAdmin} />
  }

  const tab = searchParams?.tab === 'approvals' ? 'approvals' : 'board'

  return (
    <>
      <TenantShellHeader
        context={context}
        eyebrow="Content & Kampagnen"
        title="Kanban Board"
        description="Organisiere Briefs, Ad-Texte und Creatives in einem gemeinsamen Workflow. Verschiebe Karten per Drag & Drop zwischen internem Fortschritt, Kundenfreigabe und Abschluss."
      />
      <div className="px-6 pb-2">
        <div className="flex gap-1 border-b border-slate-200 dark:border-border">
          <Link
            href="/tools/kanban?tab=board"
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === 'board'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            Board
          </Link>
          <Link
            href="/tools/kanban?tab=approvals"
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === 'approvals'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            Freigaben
          </Link>
        </div>
      </div>
      {tab === 'board' ? <KanbanWorkspace /> : <ApprovalsWorkspace />}
    </>
  )
}
