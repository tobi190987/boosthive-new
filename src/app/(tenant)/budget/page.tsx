import type { Metadata } from 'next'
import { BudgetWorkspace } from '@/components/budget-workspace'
import { ModuleLockedCard } from '@/components/module-locked-card'
import { requireTenantShellContext } from '@/lib/tenant-shell'

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
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Budget & Ad Spend Tracking
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Überwache Werbebudgets über Google Ads, Meta Ads und TikTok Ads mit Soll/Ist-Vergleich und Alerts.
        </p>
      </div>
      <BudgetWorkspace isAdmin={isAdmin} />
    </>
  )
}
