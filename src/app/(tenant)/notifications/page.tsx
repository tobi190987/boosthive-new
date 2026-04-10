import { NotificationsHistoryWorkspace } from '@/components/notifications-history-workspace'
import { requireTenantShellContext } from '@/lib/tenant-shell'
import { createAdminClient } from '@/lib/supabase-admin'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Benachrichtigungen — BoostHive',
}

export default async function NotificationsPage() {
  const context = await requireTenantShellContext()
  const admin = createAdminClient()

  const { data } = await admin
    .from('notifications')
    .select('id, type, title, body, link, read_at, created_at')
    .eq('tenant_id', context.tenant.id)
    .eq('user_id', context.user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Benachrichtigungen</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Alle Aktivitäten und Hinweise auf einen Blick.
        </p>
      </div>
      <NotificationsHistoryWorkspace notifications={data ?? []} />
    </>
  )
}
