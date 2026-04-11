import { Suspense } from 'react'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { PortfolioWorkspace } from '@/components/portfolio-workspace'

function PortfolioFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export default async function PortfolioPage() {
  const context = await requireTenantShellContext()

  return (
    <Suspense fallback={<PortfolioFallback />}>
      <PortfolioWorkspace
        isAdmin={context.membership.role === 'admin'}
        tenantName={context.tenant.name}
      />
    </Suspense>
  )
}
