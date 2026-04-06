import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'

export async function PATCH(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()

  const { error, count } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('user_id', authResult.auth.userId)
    .is('read_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, updated: count ?? 0 })
}
