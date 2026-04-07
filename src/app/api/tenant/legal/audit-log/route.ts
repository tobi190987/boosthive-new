import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

const schema = z.object({
  action_type: z.enum(['data_export', 'data_delete']),
  resource_type: z.string().trim().min(1).max(120),
  resource_id: z.string().trim().max(200).optional().nullable(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validierungsfehler.' }, { status: 400 })
  }

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: parsed.data.action_type,
    resourceType: parsed.data.resource_type,
    resourceId: parsed.data.resource_id ?? null,
    context: parsed.data.context ?? {},
  })

  return NextResponse.json({ success: true })
}
