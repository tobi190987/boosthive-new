import { TenantToolsWorkspace } from '@/components/tenant-tools-workspace'
import { getSeoAnalysisSummaries } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { ModuleHelpTooltip } from '@/components/module-help-tooltip'
import { MODULE_HELP } from '@/lib/tool-groups'

export default async function SeoAnalysePage() {
  const context = await requireTenantShellContext()
  const initialAnalyses = await getSeoAnalysisSummaries(context.tenant.id)
  const help = MODULE_HELP['seo_analyse']

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">SEO Analyse</h1>
          {help && <ModuleHelpTooltip tagline={help.tagline} features={help.features} />}
        </div>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Analysiere On-Page SEO, Metadaten und technische Optimierungen.
        </p>
      </div>
      <TenantToolsWorkspace
        role={context.membership.role}
        activeModuleCodes={context.activeModuleCodes}
        tenantName={context.tenant.name}
        tenantSlug={context.tenant.slug}
        tenantLogoUrl={context.tenant.logoUrl}
        initialAnalyses={initialAnalyses}
      />
    </>
  )
}
