import { forbidden, redirect } from 'next/navigation'
import { TeamInvitationsWorkspace } from '@/components/team-invitations-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function TeamSettingsPage() {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Team & Einladungen</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Lade Mitarbeiter ein und verwalte Rollen und Zugriffsrechte.
        </p>
      </div>
      <TeamInvitationsWorkspace tenantSlug={context.tenant.slug} />
    </>
  )
}
