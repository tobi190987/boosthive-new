import { TenantToolsWorkspace } from '@/components/tenant-tools-workspace'
import { getActiveModuleCodes } from '@/lib/module-access'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function SeoAnalysePage() {
  const context = await requireTenantShellContext()
  const activeModuleCodes = await getActiveModuleCodes(context.tenant.id)

  return (
    <TenantToolsWorkspace
      role={context.membership.role}
      activeModuleCodes={activeModuleCodes}
    />
  )
}
