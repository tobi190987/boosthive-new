import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'

const idSchema = z.string().uuid('Ungueltige Notification-ID.')

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json({ error: 'Ungueltige Notification-ID.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('user_id', authResult.auth.userId)
    .eq('id', idParsed.data)
    .select('id, read_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Notification nicht gefunden.' }, { status: 404 })

  return NextResponse.json({ notification: data })
}
