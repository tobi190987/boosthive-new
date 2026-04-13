import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const CRM_STATUSES = ['lead', 'prospect', 'active', 'paused', 'churned'] as const

const updateStatusSchema = z.object({
  crm_status: z.enum(CRM_STATUSES),
  monthly_volume: z.number().min(0).max(9999999.99).nullable().optional(),
  closing_note: z.string().trim().max(5000).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateStatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const updates: Record<string, unknown> = {
    crm_status: parsed.data.crm_status,
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.monthly_volume !== undefined) {
    updates.monthly_volume = parsed.data.monthly_volume
  }

  const { data, error } = await admin
    .from('customers')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, crm_status, monthly_volume')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If churned with closing note, log as activity
  if (parsed.data.crm_status === 'churned' && parsed.data.closing_note?.trim()) {
    await admin.from('customer_activities').insert({
      tenant_id: tenantId,
      customer_id: id,
      activity_type: 'note',
      description: `[Abschluss-Notiz] ${parsed.data.closing_note.trim()}`,
      created_by: authResult.auth.userId,
    })
  }

  return NextResponse.json({ customer: data })
}
