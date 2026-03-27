import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { OwnerSidebar } from "@/components/owner-sidebar"

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
    // TODO: Nach PROJ-3 (User Authentication) auf /login anpassen
    redirect('/')
  }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  if (!admin) {
    redirect('/')
  }

  return (
    <div className="flex h-screen bg-[#F8FAFB]">
      <OwnerSidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
