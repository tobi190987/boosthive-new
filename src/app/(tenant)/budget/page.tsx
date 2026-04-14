import type { Metadata } from 'next'
import { BudgetWorkspace } from '@/components/budget-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { TenantShellHeader } from '@/components/tenant-shell-header'

export const metadata: Metadata = {
  title: 'Budget & Ad Spend Tracking — BoostHive',
}

export default async function BudgetPage() {
  const context = await requireTenantShellContext()
  const hasAccess =
    context.activeModuleCodes.includes('all') ||
    context.activeModuleCodes.includes('budget_tracking')
  const isAdmin = context.membership.role === 'admin'

  if (!hasAccess) {
    return <ModuleLockedCard moduleName="Budget & Ad Spend Tracking" isAdmin={isAdmin} />
  }

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Verwaltung"
        title="Budget & Ad Spend Tracking"
        description="Überwache Werbebudgets über Google Ads, Meta Ads und TikTok Ads mit Soll/Ist-Vergleich und Alerts."
      />
      <BudgetWorkspace isAdmin={isAdmin} />
    </div>
  )
}
