import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { listTenantDataAuditLogs } from '@/lib/tenant-data-audit'

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const items = await listTenantDataAuditLogs(tenantId, 100)

  const userIds = [...new Set(items.map((i) => i.actor_user_id).filter(Boolean))] as string[]
  const nameMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const admin = createAdminClient()
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds)

    for (const p of profiles ?? []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      nameMap[p.user_id] = name || p.user_id
    }
  }

  const itemsWithNames = items.map((item) => ({
    ...item,
    actor_display_name: item.actor_user_id ? (nameMap[item.actor_user_id] ?? item.actor_user_id) : 'Unbekannt',
  }))

  return NextResponse.json({ items: itemsWithNames })
}
