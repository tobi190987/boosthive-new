import { TenantProfileWorkspace } from '@/components/tenant-profile-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function ProfileSettingsPage() {
  const context = await requireTenantShellContext()

  return (
    <TenantProfileWorkspace
      mode="settings"
      initialData={{
        role: context.membership.role,
        tenantName: context.tenant.name,
        firstName: context.user.firstName ?? '',
        lastName: context.user.lastName ?? '',
        avatarUrl: context.user.avatarUrl,
        billingCompany: context.tenant.billingCompany ?? '',
        billingStreet: context.tenant.billingStreet ?? '',
        billingZip: context.tenant.billingZip ?? '',
        billingCity: context.tenant.billingCity ?? '',
        billingCountry: context.tenant.billingCountry ?? '',
        billingVatId: context.tenant.billingVatId ?? '',
      }}
    />
  )
}
