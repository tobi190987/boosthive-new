import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkExportDataAvailability, type ExportType } from '@/lib/export-service'
import {
  checkRateLimit,
  EXPORTS_READ,
  getClientIp,
  rateLimitResponse,
} from '@/lib/rate-limit'

const availabilitySchema = z.object({
  type: z.enum(['keyword_rankings', 'marketing_dashboard', 'gsc_discovery', 'customer_report']),
  customer_id: z.string().uuid().nullable().optional(),
})

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`exports-read:${tenantId}:${getClientIp(request)}`, EXPORTS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const rawCustomerId = request.nextUrl.searchParams.get('customer_id')
  const parsed = availabilitySchema.safeParse({
    type: request.nextUrl.searchParams.get('type'),
    customer_id: rawCustomerId && rawCustomerId !== 'all' ? rawCustomerId : null,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ungültige Parameter.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const result = await checkExportDataAvailability({
    admin,
    tenantId,
    type: parsed.data.type as ExportType,
    customerId: parsed.data.customer_id ?? null,
  })

  return NextResponse.json(result)
}
