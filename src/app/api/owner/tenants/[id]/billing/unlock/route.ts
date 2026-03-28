import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordOwnerAuditLog } from '@/lib/owner-audit'
import { checkRateLimit, getClientIp, OWNER_WRITE, rateLimitResponse } from '@/lib/rate-limit'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/owner/tenants/[id]/billing/unlock
 * Removes a manual owner lock from a tenant.
 * Reactivates the tenant only if the billing state allows it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(`owner-tenant-billing-unlock:${getClientIp(request)}`, OWNER_WRITE)
  if (!rl.allowed) {
    return rateLimitResponse(rl)
  }

  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id: tenantId } = await params

  if (!UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Ungueltige Tenant-ID.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()

  // Verify tenant exists and is locked
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, status, subscription_status, owner_locked_at')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  if (!tenant.owner_locked_at) {
    return NextResponse.json(
      { error: 'Tenant ist nicht manuell gesperrt.' },
      { status: 409 }
    )
  }

  // Determine new status based on billing state
  const subStatus = (tenant.subscription_status as string) || 'inactive'
  const billingBlockingStatuses = ['canceled', 'unpaid', 'past_due']
  const newStatus = billingBlockingStatuses.includes(subStatus) ? 'inactive' : 'active'

  // Unlock the tenant
  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({
      status: newStatus,
      owner_locked_at: null,
      owner_locked_by: null,
      owner_lock_reason: null,
    })
    .eq('id', tenantId)

  if (updateError) {
    console.error('[POST /api/owner/tenants/[id]/billing/unlock] DB-Update fehlgeschlagen:', updateError)
    return NextResponse.json(
      { error: 'Tenant konnte nicht freigeschaltet werden.' },
      { status: 500 }
    )
  }

  // Audit log
  await recordOwnerAuditLog({
    actorUserId: auth.userId,
    tenantId,
    eventType: 'tenant_status_updated',
    context: {
      action: 'manual_unlock',
      previousStatus: tenant.status,
      newStatus,
      billingStatus: subStatus,
    },
  })

  return NextResponse.json({
    success: true,
    newStatus,
    note: newStatus === 'inactive'
      ? 'Tenant wurde entsperrt, bleibt aber inaktiv wegen Billing-Status.'
      : 'Tenant wurde erfolgreich freigeschaltet.',
  })
}
