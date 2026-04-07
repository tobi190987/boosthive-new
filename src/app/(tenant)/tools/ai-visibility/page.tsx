import { getVisibilityProjectsList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AiVisibilityWorkspace } from '@/components/ai-visibility-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'

export default async function AiVisibilityPage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('ai_visibility')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="AI Visibility" isAdmin={isAdmin} />
  }

  const initialProjects = await getVisibilityProjectsList(context.tenant.id)

  return (
    <AiVisibilityWorkspace
      role={context.membership.role}
      initialProjects={initialProjects}
    />
  )
}
