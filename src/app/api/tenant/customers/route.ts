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

const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich.').max(200),
  domain: z.string().trim().max(500).nullable().optional(),
  industry: z.string().trim().max(200).nullable().optional(),
  status: z.enum(['active', 'paused']).default('active'),
})

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-read:${tenantId}:${getClientIp(request)}`, CUSTOMERS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

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
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customers: data ?? [] })
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = createCustomerSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  const { name, domain, industry, status } = parsed.data
  const admin = createAdminClient()

  // Check for duplicate domain within same tenant (only if domain is provided)
  if (domain && domain.trim()) {
    const { data: existingCustomer } = await admin
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('domain', domain.trim().toLowerCase())
      .is('deleted_at', null)
      .maybeSingle() // Use maybeSingle instead of single to avoid errors

    if (existingCustomer) {
      return NextResponse.json({ 
        error: 'Ein Kunde mit dieser Website-URL existiert bereits.' 
      }, { status: 409 })
    }
  }

  const { data, error } = await admin
    .from('customers')
    .insert({
      tenant_id: tenantId,
      created_by: authResult.auth.userId,
      name,
      domain: domain ?? null,
      industry: industry ?? null,
      status,
    })
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
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customer: data }, { status: 201 })
}
