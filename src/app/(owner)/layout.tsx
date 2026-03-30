import { forbidden, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { OwnerSidebar, OwnerMobileHeader } from '@/components/owner-sidebar'
import { requireOwnerShellContext } from '@/lib/owner-shell'

// BUG-4: Server-seitiger Auth-Guard — unauthentifizierte und Non-Owner-User
// werden sofort weitergeleitet, bevor HTML gerendert wird.
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/owner/login')
  }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  if (!admin) {
    forbidden()
  }

  const context = await requireOwnerShellContext()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <OwnerSidebar context={context} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <OwnerMobileHeader context={context} />
          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
