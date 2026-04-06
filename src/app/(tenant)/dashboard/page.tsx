import { TenantDashboardOverview } from '@/components/tenant-dashboard-overview'
import { getTenantDashboardData } from '@/lib/tenant-app-data'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function TenantDashboardPage() {
  const context = await requireTenantShellContext()
  const initialData = await getTenantDashboardData(
    context.tenant.id,
    context.user.id,
    context.membership.role
  )

  return <TenantDashboardOverview context={context} initialData={initialData} />
}
