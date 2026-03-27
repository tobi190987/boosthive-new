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
    <TeamInvitationsWorkspace tenantSlug={context.tenant.slug} />
  )
}
