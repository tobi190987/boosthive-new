import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { OwnerSidebar, OwnerMobileHeader } from "@/components/owner-sidebar"

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

  const supabaseAdmin = createAdminClient()
  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  if (!admin) {
    redirect('/owner/login')
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#F8FAFB]">
      <OwnerMobileHeader />
      <OwnerSidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
