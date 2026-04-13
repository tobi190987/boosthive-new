import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'note', 'task'] as const

const updateActivitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  activity_date: z.string().datetime().optional(),
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

async function isTenantAdmin(tenantId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data?.role === 'admin'
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id, actId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateActivitySchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load activity and verify ownership/admin
  const { data: existing } = await admin
    .from('customer_activities')
    .select('id, created_by, tenant_id, customer_id')
    .eq('id', actId)
    .eq('tenant_id', tenantId)
    .eq('customer_id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Aktivität nicht gefunden.' }, { status: 404 })

  const isAdmin = await isTenantAdmin(tenantId, authResult.auth.userId)
  if (existing.created_by !== authResult.auth.userId && !isAdmin) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.activity_type !== undefined) updates.activity_type = parsed.data.activity_type
  if (parsed.data.description !== undefined) updates.description = parsed.data.description
  if (parsed.data.activity_date !== undefined) updates.activity_date = parsed.data.activity_date
  if (parsed.data.follow_up_date !== undefined) updates.follow_up_date = parsed.data.follow_up_date

  const { data, error } = await admin
    .from('customer_activities')
    .update(updates)
    .eq('id', actId)
    .eq('tenant_id', tenantId)
    .select('id, activity_type, description, activity_date, follow_up_date, created_by, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ activity: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-delete:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id, actId } = await params
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('customer_activities')
    .select('id, created_by')
    .eq('id', actId)
    .eq('tenant_id', tenantId)
    .eq('customer_id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Aktivität nicht gefunden.' }, { status: 404 })

  const isAdmin = await isTenantAdmin(tenantId, authResult.auth.userId)
  if (existing.created_by !== authResult.auth.userId && !isAdmin) {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 })
  }

  const { error } = await admin
    .from('customer_activities')
    .delete()
    .eq('id', actId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
