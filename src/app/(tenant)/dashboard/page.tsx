import { Suspense } from 'react'
import { MarketingDashboardWorkspace } from '@/components/marketing-dashboard-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { Skeleton } from '@/components/ui/skeleton'

function DashboardFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-border dark:bg-card"
          >
            <div className="flex items-start gap-4">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function TenantDashboardPage() {
  const context = await requireTenantShellContext()

  return (
    <Suspense fallback={<DashboardFallback />}>
      <MarketingDashboardWorkspace context={context} />
    </Suspense>
  )
}
