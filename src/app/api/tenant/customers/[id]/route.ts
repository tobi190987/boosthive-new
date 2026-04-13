import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser, requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'
import { CUSTOMER_INDUSTRIES, CUSTOMER_INDUSTRY_ERROR_MESSAGE } from '@/lib/customer-industries'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const CRM_STATUSES = ['lead', 'prospect', 'active', 'paused', 'churned'] as const

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich.').max(200).optional(),
  domain: z.string().trim().max(500).nullable().optional(),
  industry: z.enum(CUSTOMER_INDUSTRIES, {
    error: () => ({ message: CUSTOMER_INDUSTRY_ERROR_MESSAGE }),
  }).optional(),
  contact_email: z.string().trim().email('Ungültige E-Mail-Adresse.').nullable().optional(),
  internal_notes: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(['active', 'paused']).optional(),
  crm_status: z.enum(CRM_STATUSES).optional(),
  monthly_volume: z.number().min(0).max(9999999.99).nullable().optional(),
  churn_note: z.string().trim().max(5000).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-read:${tenantId}:${getClientIp(request)}`, CUSTOMERS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('customers')
    .select(`
      id, 
      name, 
      domain, 
      industry,
      logo_url,
      internal_notes,
      status, 
      created_at, 
      updated_at
    `)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ customer: data })
}

export async function PUT(
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

  const parsed = updateCustomerSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.domain !== undefined) updates.domain = parsed.data.domain
  if (parsed.data.industry !== undefined) updates.industry = parsed.data.industry
  if (parsed.data.contact_email !== undefined) updates.contact_email = parsed.data.contact_email
  if (parsed.data.internal_notes !== undefined) updates.internal_notes = parsed.data.internal_notes
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.crm_status !== undefined) updates.crm_status = parsed.data.crm_status
  if (parsed.data.monthly_volume !== undefined) updates.monthly_volume = parsed.data.monthly_volume

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customers')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(`
      id,
      name,
      domain,
      industry,
      contact_email,
      logo_url,
      internal_notes,
      status,
      crm_status,
      monthly_volume,
      created_at,
      updated_at
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If churned with a closing note, log it as an activity (EC-1)
  if (parsed.data.crm_status === 'churned' && parsed.data.churn_note?.trim()) {
    await admin.from('customer_activities').insert({
      tenant_id: tenantId,
      customer_id: id,
      activity_type: 'note',
      description: `[Abschluss-Notiz] ${parsed.data.churn_note.trim()}`,
      created_by: authResult.auth.userId,
    })
  }

  return NextResponse.json({ customer: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-delete:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const admin = createAdminClient()

  // Soft delete
  const { error } = await admin
    .from('customers')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'customer',
    resourceId: id,
  })

  return new NextResponse(null, { status: 204 })
}
