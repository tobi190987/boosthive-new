import { TenantDashboardOverview } from '@/components/tenant-dashboard-overview'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function TenantDashboardPage() {
  const context = await requireTenantShellContext()

  return <TenantDashboardOverview context={context} />
}
