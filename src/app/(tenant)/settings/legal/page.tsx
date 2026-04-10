import { forbidden, redirect } from 'next/navigation'
import { LegalPrivacyWorkspace } from '@/components/legal-privacy-workspace'
import { SettingsProfileTabs } from '@/components/settings-profile-tabs'
import { getSubprocessorEntries } from '@/lib/legal'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function LegalSettingsPage() {
  const context = await requireTenantShellContext()
  const subprocessorEntries = getSubprocessorEntries()

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
      <SettingsProfileTabs isAdmin={true} />
      <LegalPrivacyWorkspace subprocessorEntries={subprocessorEntries} />
    </>
  )
}
