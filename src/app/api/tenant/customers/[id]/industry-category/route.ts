import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin, requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
  CUSTOMERS_READ,
} from '@/lib/rate-limit'

// GET  /api/tenant/customers/[id]/industry-category  — Liest die Branche eines Kunden (BUG-1)
// PATCH /api/tenant/customers/[id]/industry-category — Speichert die Branche (Admin-only)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `customers-read:${tenantId}:${getClientIp(request)}`,
    CUSTOMERS_READ
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const auth = await requireTenantUser(tenantId)
  if ('error' in auth) return auth.error

  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('customers')
    .select('id, industry_category')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({ industry_category: data.industry_category ?? null })
}

const BodySchema = z.object({
  industry_category: z
    .string()
    .trim()
    .min(2, 'Branche muss mindestens 2 Zeichen haben.')
    .max(60, 'Branche darf maximal 60 Zeichen haben.')
    .nullable(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(
    `customers-write:${tenantId}:${getClientIp(request)}`,
    CUSTOMERS_WRITE
  )
  if (!rl.allowed) return rateLimitResponse(rl)

  const auth = await requireTenantAdmin(tenantId)
  if ('error' in auth) return auth.error

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Validierungsfehler.'
    return NextResponse.json({ error: firstIssue }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('customers')
    .update({
      industry_category: parsed.data.industry_category,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, industry_category')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ customer: data })
}
