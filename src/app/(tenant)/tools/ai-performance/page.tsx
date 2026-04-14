import { getPerformanceHistoryList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AiPerformanceWorkspace } from '@/components/ai-performance-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { QuotaBadge } from '@/components/quota-badge'
import { TenantShellHeader } from '@/components/tenant-shell-header'
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
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Analyse & SEO"
        title="AI Performance"
        description="Starte KI-Analysen für Websites und Anzeigen — erhalte Optimierungsvorschläge und vergleiche Ergebnisse im zeitlichen Verlauf."
        features={help?.features}
        badge={<QuotaBadge metric="ai_performance_analyses" label="Analysen" />}
      />
      <AiPerformanceWorkspace initialAnalyses={initialAnalyses} />
    </div>
  )
}
