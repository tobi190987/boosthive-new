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
    <KeywordProjectsWorkspace
      role={context.membership.role}
      initialProjects={initialProjects}
    />
  )
}
