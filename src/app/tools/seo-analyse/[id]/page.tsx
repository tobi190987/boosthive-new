import { TenantToolsWorkspace } from '@/components/tenant-tools-workspace'
import { getActiveModuleCodes } from '@/lib/module-access'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function SeoAnalyseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const context = await requireTenantShellContext()
  const activeModuleCodes = await getActiveModuleCodes(context.tenant.id)
  const { id } = await params

  return (
    <TenantToolsWorkspace
      role={context.membership.role}
      activeModuleCodes={activeModuleCodes}
      tenantName={context.tenant.name}
      tenantSlug={context.tenant.slug}
      tenantLogoUrl={context.tenant.logoUrl}
      initialAnalysisId={id}
    />
  )
}
