import { TenantToolsWorkspace } from '@/components/tenant-tools-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function SeoAnalysePage() {
  const context = await requireTenantShellContext()

  return (
    <TenantToolsWorkspace
      role={context.membership.role}
      activeModuleCodes={context.activeModuleCodes}
      tenantName={context.tenant.name}
      tenantSlug={context.tenant.slug}
      tenantLogoUrl={context.tenant.logoUrl}
    />
  )
}
