import { requireTenantContext } from '@/lib/tenant'
import { TeamInvitationsWorkspace } from '@/components/team-invitations-workspace'

export default async function TeamSettingsPage() {
  const tenant = await requireTenantContext()

  return (
    <main className="min-h-screen bg-[#f3efe7] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <TeamInvitationsWorkspace tenantSlug={tenant.slug} />
      </div>
    </main>
  )
}
