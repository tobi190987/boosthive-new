import { requireTenantShellContext } from '@/lib/tenant-shell'
import { CustomersManagementWorkspace } from '@/components/customers-management-workspace'
import { TenantShellHeader } from '@/components/tenant-shell-header'

export default async function CustomersPage() {
  const context = await requireTenantShellContext()
  const isAdmin = context.membership.role === 'admin'

  return (
    <>
      <TenantShellHeader
        context={context}
        eyebrow="Verwaltung"
        title="Kunden"
        description="Verwalte deine Kunden und ordne ihnen Analyse-Daten zu."
      />
      <CustomersManagementWorkspace isAdmin={isAdmin} />
    </>
  )
}
