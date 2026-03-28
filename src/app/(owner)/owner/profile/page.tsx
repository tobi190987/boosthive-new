import { OwnerProfileWorkspace } from '@/components/owner-profile-workspace'
import { requireOwnerShellContext } from '@/lib/owner-shell'

export default async function OwnerProfilePage() {
  const context = await requireOwnerShellContext()

  return (
    <OwnerProfileWorkspace
      initialData={{
        email: context.user.email,
        firstName: context.user.firstName ?? '',
        lastName: context.user.lastName ?? '',
        avatarUrl: context.user.avatarUrl,
      }}
    />
  )
}
