import { TenantToolsWorkspace } from '@/components/tenant-tools-workspace'
import { getSeoAnalysisStatus, getSeoAnalysisSummaries } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function SeoAnalyseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const context = await requireTenantShellContext()
  const { id } = await params
  const [initialAnalyses, initialAnalysisStatus] = await Promise.all([
    getSeoAnalysisSummaries(context.tenant.id),
    getSeoAnalysisStatus(context.tenant.id, id),
  ])

  return (
    <TenantToolsWorkspace
      role={context.membership.role}
      activeModuleCodes={context.activeModuleCodes}
      tenantName={context.tenant.name}
      tenantSlug={context.tenant.slug}
      tenantLogoUrl={context.tenant.logoUrl}
      initialAnalysisId={id}
      initialAnalyses={initialAnalyses}
      initialAnalysisStatus={initialAnalysisStatus}
    />
  )
}
