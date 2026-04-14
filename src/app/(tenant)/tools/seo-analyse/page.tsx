import { Suspense } from 'react'
import { TenantToolsWorkspace } from '@/components/tenant-tools-workspace'
import { getSeoAnalysisSummaries } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { TenantShellHeader } from '@/components/tenant-shell-header'
import { MODULE_HELP } from '@/lib/tool-groups'
import { Skeleton } from '@/components/ui/skeleton'
import type { TenantShellContext } from '@/lib/tenant-shell'

async function SeoAnalyseContent({ context }: { context: TenantShellContext }) {
  const initialAnalyses = await getSeoAnalysisSummaries(context.tenant.id)
  return (
    <TenantToolsWorkspace
      role={context.membership.role}
      activeModuleCodes={context.activeModuleCodes}
      tenantName={context.tenant.name}
      tenantSlug={context.tenant.slug}
      tenantLogoUrl={context.tenant.logoUrl}
      initialAnalyses={initialAnalyses}
    />
  )
}

function SeoAnalyseSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
    </div>
  )
}

export default async function SeoAnalysePage() {
  const context = await requireTenantShellContext()
  const help = MODULE_HELP['seo_analyse']

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Analyse & SEO"
        title="SEO Analyse"
        description="Analysiere URLs auf technische SEO-Fehler, Metadaten und On-Page-Faktoren — mit konkreten Handlungsempfehlungen für jede Website."
        features={help?.features}
      />
      <Suspense fallback={<SeoAnalyseSkeleton />}>
        <SeoAnalyseContent context={context} />
      </Suspense>
    </div>
  )
}
