import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordOwnerAuditLog } from '@/lib/owner-audit'
import { checkRateLimit, getClientIp, OWNER_WRITE, rateLimitResponse } from '@/lib/rate-limit'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LockSchema = z.object({
  reason: z.string().max(500).optional(),
})

/**
 * POST /api/owner/tenants/[id]/billing/lock
 * Manually locks a tenant, independent of Stripe status.
 * Sets tenants.status = 'inactive' and records the owner override metadata.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(`owner-tenant-billing-lock:${getClientIp(request)}`, OWNER_WRITE)
  if (!rl.allowed) {
    return rateLimitResponse(rl)
  }

  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id: tenantId } = await params

  if (!UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Ungültige Tenant-ID.' }, { status: 400 })
  }

  // Parse optional reason from body
  let reason: string | null = null
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = LockSchema.safeParse(body)
    if (parsed.success && parsed.data.reason) {
      reason = parsed.data.reason
    }
  } catch {
    // No body is fine
  }

  const supabaseAdmin = createAdminClient()

  // Verify tenant exists and is not already locked
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, status, owner_locked_at')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  if (tenant.owner_locked_at) {
    return NextResponse.json(
      { error: 'Tenant ist bereits gesperrt.' },
      { status: 409 }
    )
  }

  // Lock the tenant
  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({
      status: 'inactive',
      owner_locked_at: new Date().toISOString(),
      owner_locked_by: auth.userId,
      owner_lock_reason: reason,
    })
    .eq('id', tenantId)

  if (updateError) {
    console.error('[POST /api/owner/tenants/[id]/billing/lock] DB-Update fehlgeschlagen:', updateError)
    return NextResponse.json(
      { error: 'Tenant konnte nicht gesperrt werden.' },
      { status: 500 }
    )
  }

  // Audit log
  await recordOwnerAuditLog({
    actorUserId: auth.userId,
    tenantId,
    eventType: 'tenant_status_updated',
    context: {
      action: 'manual_lock',
      reason,
      previousStatus: tenant.status,
    },
  })

  return NextResponse.json({ success: true })
}
