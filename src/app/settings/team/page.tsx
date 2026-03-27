import { TeamInvitationsWorkspace } from '@/components/team-invitations-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'

export default async function TeamSettingsPage() {
  const context = await requireTenantShellContext()

  return (
    <TeamInvitationsWorkspace tenantSlug={context.tenant.slug} />
  )
}
