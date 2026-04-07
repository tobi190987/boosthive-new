import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser, requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Titel ist erforderlich.').max(200).optional(),
  url: z.string().trim().min(1, 'URL ist erforderlich.').max(2000).url('Ungültige URL').optional(),
  description: z.string().trim().max(1000).nullable().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id, docId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = updateDocumentSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  // First verify customer exists and belongs to tenant
  const admin = createAdminClient()
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.title !== undefined) updates.title = parsed.data.title
  if (parsed.data.url !== undefined) updates.url = parsed.data.url
  if (parsed.data.description !== undefined) updates.description = parsed.data.description

  const { data, error } = await admin
    .from('customer_documents')
    .update(updates)
    .eq('customer_id', id)
    .eq('id', docId)
    .select(`
      id,
      title,
      url,
      description,
      created_at,
      updated_at
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ document: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id, docId } = await params
  const admin = createAdminClient()

  // First verify customer exists and belongs to tenant
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  const { error } = await admin
    .from('customer_documents')
    .delete()
    .eq('customer_id', id)
    .eq('id', docId)

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'customer_document',
    resourceId: docId,
    context: { customer_id: id },
  })

  return new NextResponse(null, { status: 204 })
}
