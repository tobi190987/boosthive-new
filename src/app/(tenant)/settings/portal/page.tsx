import { forbidden, redirect } from 'next/navigation'
import { PortalSettingsWorkspace } from '@/components/portal-settings-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { SettingsProfileTabs } from '@/components/settings-profile-tabs'

export default async function PortalSettingsPage() {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

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
      <div className="mt-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Client-Portal</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Branding und Darstellung des Kundenportals konfigurieren.
          </p>
        </div>
        <PortalSettingsWorkspace />
      </div>
    </>
  )
}
