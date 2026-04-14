import { getPerformanceHistoryList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AiPerformanceWorkspace } from '@/components/ai-performance-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { QuotaBadge } from '@/components/quota-badge'
import { ModuleHelpTooltip } from '@/components/module-help-tooltip'
import { MODULE_HELP } from '@/lib/tool-groups'

export default async function AiPerformancePage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('ai_performance')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="AI Performance" isAdmin={isAdmin} />
  }

  const initialAnalyses = await getPerformanceHistoryList(context.tenant.id)
  const help = MODULE_HELP['ai_performance']

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">AI Performance</h1>
          <QuotaBadge metric="ai_performance_analyses" label="Analysen" />
          {help && <ModuleHelpTooltip tagline={help.tagline} features={help.features} />}
        </div>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Starte KI-Analysen für Websites und Anzeigen — erhalte Optimierungsvorschläge
          und vergleiche Ergebnisse im zeitlichen Verlauf.
        </p>
      </div>
      <AiPerformanceWorkspace initialAnalyses={initialAnalyses} />
    </>
  )
}
