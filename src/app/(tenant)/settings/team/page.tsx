import { forbidden, redirect } from 'next/navigation'
import { TeamInvitationsWorkspace } from '@/components/team-invitations-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { TenantShellHeader } from '@/components/tenant-shell-header'

export default async function TeamSettingsPage() {
  const context = await requireTenantShellContext()

  if (!context.onboarding.isComplete) {
    redirect('/onboarding')
  }

  if (context.membership.role !== 'admin') {
    forbidden()
  }

  return (
    <div className="space-y-6">
      <TenantShellHeader
        context={context}
        eyebrow="Verwaltung"
        title="Team & Einladungen"
        description="Lade Mitarbeiter ein, vergib Rollen und verwalte Zugriffsrechte für deinen Workspace."
      />
      <TeamInvitationsWorkspace tenantSlug={context.tenant.slug} />
    </div>
  )
}
