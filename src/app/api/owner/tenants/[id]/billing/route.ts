import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/owner/tenants/[id]/billing
 * Returns detailed billing information for a single tenant.
 * Only accessible by platform owners.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const { id: tenantId } = await params

  if (!UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: 'Ungueltige Tenant-ID.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()

  // Load tenant with billing columns
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, name, slug, status, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_period_end, owner_locked_at, owner_locked_by, owner_lock_reason'
    )
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  const subStatus = (tenant.subscription_status as string) || 'none'
  const isOwnerLocked = tenant.owner_locked_at != null
  const tenantStatus = tenant.status as string

  // Determine access state
  let accessState = 'accessible'
  if (isOwnerLocked || tenantStatus === 'inactive') {
    accessState = 'manual_locked'
  } else if (['past_due', 'canceled', 'unpaid'].includes(subStatus)) {
    accessState = 'billing_blocked'
  }

  let displaySubStatus = subStatus
  if (subStatus === 'inactive') displaySubStatus = 'none'

  // Load base plan price
  let basePlanAmount = 4900
  let basePlanCurrency = 'eur'
  const basePlanPriceId = process.env.STRIPE_BASIS_PLAN_PRICE_ID
  if (basePlanPriceId) {
    try {
      const { stripe } = await import('@/lib/stripe')
      const price = await stripe.prices.retrieve(basePlanPriceId)
      basePlanAmount = price.unit_amount ?? 4900
      basePlanCurrency = price.currency
    } catch {
      // use defaults
    }
  }

  // Load module bookings with module details
  const { data: moduleBookings } = await supabaseAdmin
    .from('tenant_modules')
    .select('id, module_id, status, current_period_end, cancel_at_period_end, modules!inner(id, code, name, description, stripe_price_id)')
    .eq('tenant_id', tenantId)

  // Load module prices
  const priceCache = new Map<string, { amount: number; currency: string }>()
  const moduleDetails: {
    id: string
    code: string
    name: string
    description: string
    status: string
    price: number
    currency: string
    currentPeriodEnd: string | null
  }[] = []

  if (moduleBookings) {
    for (const booking of moduleBookings) {
      const mod = booking.modules as unknown as {
        id: string
        code: string
        name: string
        description: string
        stripe_price_id: string
      }

      if (!priceCache.has(mod.stripe_price_id)) {
        try {
          const { stripe } = await import('@/lib/stripe')
          const price = await stripe.prices.retrieve(mod.stripe_price_id)
          priceCache.set(mod.stripe_price_id, {
            amount: price.unit_amount ?? 0,
            currency: price.currency,
          })
        } catch {
          priceCache.set(mod.stripe_price_id, { amount: 0, currency: 'eur' })
        }
      }

      const priceInfo = priceCache.get(mod.stripe_price_id) ?? { amount: 0, currency: 'eur' }

      moduleDetails.push({
        id: mod.id,
        code: mod.code,
        name: mod.name,
        description: mod.description,
        status: booking.status as string,
        price: priceInfo.amount,
        currency: priceInfo.currency,
        currentPeriodEnd: (booking.current_period_end as string) ?? null,
      })
    }
  }

  // Calculate total amount
  const activeModules = moduleDetails.filter((m) => m.status === 'active' || m.status === 'canceling')
  const hasActiveSub = ['active', 'canceling', 'past_due'].includes(subStatus)
  const modulesTotal = activeModules.reduce((sum, m) => sum + m.price, 0)
  const totalAmount = hasActiveSub ? basePlanAmount + modulesTotal : 0

  return NextResponse.json({
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    subscriptionStatus: displaySubStatus,
    subscriptionPeriodEnd: (tenant.subscription_period_end as string) ?? null,
    basePlanAmount,
    basePlanCurrency,
    totalAmount,
    currency: basePlanCurrency,
    accessState,
    ownerLocked: isOwnerLocked,
    ownerLockedAt: (tenant.owner_locked_at as string) ?? null,
    ownerLockReason: (tenant.owner_lock_reason as string) ?? null,
    modules: moduleDetails,
  })
}
