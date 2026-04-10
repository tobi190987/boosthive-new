import { SettingsProfileWorkspace } from '@/components/settings-profile-workspace'
import { SettingsProfileTabs } from '@/components/settings-profile-tabs'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function ProfileSettingsPage() {
  const context = await requireTenantShellContext()

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Einstellungen</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Profil, Team und rechtliche Angaben verwalten.
        </p>
      </div>
      <div className="mb-6 h-px bg-slate-100 dark:bg-slate-800" />
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
