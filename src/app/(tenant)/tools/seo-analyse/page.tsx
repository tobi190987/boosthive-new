import { Suspense } from 'react'
import { TenantToolsWorkspace } from '@/components/tenant-tools-workspace'
import { getSeoAnalysisSummaries } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { ModuleHelpTooltip } from '@/components/module-help-tooltip'
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
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">SEO Analyse</h1>
          {help && <ModuleHelpTooltip tagline={help.tagline} features={help.features} />}
        </div>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Analysiere URLs auf technische SEO-Fehler, Metadaten und On-Page-Faktoren —
          mit konkreten Handlungsempfehlungen für jede Website.
        </p>
      </div>
      <Suspense fallback={<SeoAnalyseSkeleton />}>
        <SeoAnalyseContent context={context} />
      </Suspense>
    </>
  )
}
