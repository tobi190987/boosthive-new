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
      <SettingsProfileTabs isAdmin={true} />
      <LegalPrivacyWorkspace subprocessorEntries={subprocessorEntries} />
    </>
  )
}
