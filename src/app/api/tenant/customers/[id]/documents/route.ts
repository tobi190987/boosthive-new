import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser, requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_READ,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const createDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Titel ist erforderlich.').max(200),
  url: z.string().trim().min(1, 'URL ist erforderlich.').max(2000).url('Ungültige URL'),
  description: z.string().trim().max(1000).nullable().optional(),
})

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Titel ist erforderlich.').max(200).optional(),
  url: z.string().trim().min(1, 'URL ist erforderlich.').max(2000).url('Ungültige URL').optional(),
  description: z.string().trim().max(1000).nullable().optional(),
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

  const { data, error } = await admin
    .from('customer_documents')
    .select(`
      id,
      title,
      url,
      description,
      doc_type,
      file_name,
      created_at,
      updated_at
    `)
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documents: data || [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createDocumentSchema.safeParse(body)
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

  const { title, url, description } = parsed.data

  const { data, error } = await admin
    .from('customer_documents')
    .insert({
      customer_id: id,
      title,
      url,
      description,
      doc_type: 'link',
    })
    .select(`
      id,
      title,
      url,
      description,
      doc_type,
      file_name,
      created_at,
      updated_at
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ document: data }, { status: 201 })
}
