import { SettingsProfileWorkspace } from '@/components/settings-profile-workspace'
import { SettingsProfileTabs } from '@/components/settings-profile-tabs'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function ProfileSettingsPage() {
  const context = await requireTenantShellContext()

  return (
    <>
      <SettingsProfileTabs isAdmin={context.membership.role === 'admin'} />
      <SettingsProfileWorkspace
        mode="settings"
        initialData={{
          role: context.membership.role,
          email: context.user.email,
          tenantName: context.tenant.name,
          tenantLogoUrl: context.tenant.logoUrl,
          firstName: context.user.firstName ?? '',
          lastName: context.user.lastName ?? '',
          avatarUrl: context.user.avatarUrl,
          notifyOnApprovalDecision: context.user.notifyOnApprovalDecision,
          billingCompany: context.tenant.billingCompany ?? '',
          billingStreet: context.tenant.billingStreet ?? '',
          billingZip: context.tenant.billingZip ?? '',
          billingCity: context.tenant.billingCity ?? '',
          billingCountry: context.tenant.billingCountry ?? '',
          billingVatId: context.tenant.billingVatId ?? '',
        }}
      />
    </>
  )
}
