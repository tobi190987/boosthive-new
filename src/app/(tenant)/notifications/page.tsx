import { TenantShellHeader } from '@/components/tenant-shell-header'
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
      <TenantShellHeader
        context={context}
        eyebrow="Übersicht"
        title="Benachrichtigungen"
        description="Alle Aktivitäten und Hinweise auf einen Blick."
      />
      <NotificationsHistoryWorkspace notifications={data ?? []} />
    </>
  )
}
