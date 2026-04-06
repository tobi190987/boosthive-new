import { BillingWorkspace } from '@/components/billing-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function BillingPage() {
  const context = await requireTenantShellContext()

  return <BillingWorkspace tenantSlug={context.tenant.slug} />
}
