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

  return <ContentBriefsWorkspace initialBriefs={initialBriefs} />
}
