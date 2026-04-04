import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  AD_GENERATOR_READ,
} from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungültige Generierungs-ID.')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`ad-generator-read:${tenantId}:${getClientIp(request)}`, AD_GENERATOR_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ad_generator')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Ungültige Generierungs-ID.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ad_generations')
    .select('id, briefing, result, customer_id, status, created_at, customers(name)')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Generierung nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({
    generation: {
      id: data.id,
      briefing: isRecord(data.briefing) ? data.briefing : {},
      result: isRecord(data.result) ? data.result : {},
      customer_id: data.customer_id ?? null,
      customer_name: extractCustomerName(data.customers),
      created_at: data.created_at,
      status: data.status,
    },
  })
}

function extractCustomerName(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0]
    if (isRecord(first) && typeof first.name === 'string' && first.name.trim()) return first.name.trim()
    return null
  }
  if (isRecord(value) && typeof value.name === 'string' && value.name.trim()) {
    return value.name.trim()
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
