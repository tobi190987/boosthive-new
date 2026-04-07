import { ApprovalsWorkspace } from '@/components/approvals-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function ApprovalsPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('content_briefs') ||
    context.activeModuleCodes.includes('ad_generator') ||
    context.activeModuleCodes.includes('all')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Freigaben" isAdmin={isAdmin} />
  }

  return <ApprovalsWorkspace />
}
