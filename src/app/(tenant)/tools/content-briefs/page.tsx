import { getContentBriefsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { ContentBriefsWorkspace } from '@/components/content-briefs-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'

export default async function ContentBriefsPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('content_briefs') || context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Content Briefs" isAdmin={isAdmin} />
  }

  const initialBriefs = await getContentBriefsList(context.tenant.id)

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Content Briefs</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Erstelle strukturierte Inhaltsanweisungen für SEO-optimierten Content.
        </p>
      </div>
      <ContentBriefsWorkspace initialBriefs={initialBriefs} />
    </>
  )
}
