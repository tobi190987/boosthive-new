import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CONTENT_BRIEFS_READ,
  CONTENT_BRIEFS_WRITE,
} from '@/lib/rate-limit'

const idSchema = z.string().uuid('Ungültige Brief-ID.')

// ─── GET: Single brief ────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`content-briefs-read:${tenantId}:${getClientIp(request)}`, CONTENT_BRIEFS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'content_briefs')
  if ('error' in moduleAccess) return moduleAccess.error

  const { id } = await params
  const idParsed = idSchema.safeParse(id)
  if (!idParsed.success) return NextResponse.json({ error: 'Ungültige Brief-ID.' }, { status: 400 })

  const admin = createAdminClient()

  const { data: brief, error } = await admin
    .from('content_briefs')
    .select('id, keyword, language, tone, word_count_target, target_url, status, brief_json, error_message, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (error || !brief) {
    return NextResponse.json({ error: 'Brief nicht gefunden.' }, { status: 404 })
  }

  return NextResponse.json({ brief })
}

// ─── DELETE: Remove brief ─────────────────────────────────────────────────────

export async function DELETE(
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
  if (!idParsed.success) return NextResponse.json({ error: 'Ungültige Brief-ID.' }, { status: 400 })

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('content_briefs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Brief nicht gefunden.' }, { status: 404 })

  const { error } = await admin
    .from('content_briefs')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_delete',
    resourceType: 'content_brief',
    resourceId: id,
  })

  return NextResponse.json({ success: true })
}
