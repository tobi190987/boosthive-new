import { getPerformanceHistoryList } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { AiPerformanceWorkspace } from '@/components/ai-performance-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'

export default async function AiPerformancePage() {
  const context = await requireTenantShellContext()
  const hasAccess = context.activeModuleCodes.includes('ai_performance')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="AI Performance" isAdmin={isAdmin} />
  }

  const initialAnalyses = await getPerformanceHistoryList(context.tenant.id)

  return <AiPerformanceWorkspace initialAnalyses={initialAnalyses} />
}
