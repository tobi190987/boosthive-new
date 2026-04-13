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

const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(300),
  checked: z.boolean(),
  custom: z.boolean().optional(),
})

const updateOnboardingSchema = z.object({
  checklist: z.array(checklistItemSchema).max(100),
})

export async function PATCH(
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

  const parsed = updateOnboardingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customers')
    .update({
      onboarding_checklist: parsed.data.checklist,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, onboarding_checklist')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ customer: data })
}
