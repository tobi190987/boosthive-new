import { getKeywordProjectsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { KeywordProjectsWorkspace } from '@/components/keyword-projects-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'

export default async function KeywordsPage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('seo_analyse')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Keywordranking" isAdmin={isAdmin} />
  }

  const initialProjects = await getKeywordProjectsList(context.tenant.id)

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Keywordranking</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Tracke Rankings deiner Keywords über Zeit.
        </p>
      </div>
      <KeywordProjectsWorkspace
        role={context.membership.role}
        initialProjects={initialProjects}
      />
    </>
  )
}
