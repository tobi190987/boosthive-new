import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { KANBAN_WORKFLOW_STATUSES } from '@/lib/kanban-shared'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CONTENT_BRIEFS_WRITE,
} from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungueltige Brief-ID.')

const patchSchema = z.object({
  workflow_status: z.enum(KANBAN_WORKFLOW_STATUSES),
})

// PATCH: Update workflow_status for a content brief inline
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`content-briefs-write:${tenantId}:${getClientIp(request)}`, CONTENT_BRIEFS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'content_briefs')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) return NextResponse.json({ error: 'Ungueltige Brief-ID.' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    const firstDetail = Object.values(details).flat().find(Boolean)
    return NextResponse.json({ error: firstDetail ?? 'Validierungsfehler.', details }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: brief } = await admin
    .from('content_briefs')
    .select('id, workflow_status')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (!brief) {
    return NextResponse.json({ error: 'Brief nicht gefunden.' }, { status: 404 })
  }

  if (brief.workflow_status === parsed.data.workflow_status) {
    return NextResponse.json({ success: true, workflow_status: brief.workflow_status })
  }

  const { error } = await admin
    .from('content_briefs')
    .update({
      workflow_status: parsed.data.workflow_status,
      workflow_status_changed_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, workflow_status: parsed.data.workflow_status })
}
