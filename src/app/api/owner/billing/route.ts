import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import { createAdminClient } from '@/lib/supabase-admin'

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * GET /api/owner/billing
 * Returns paginated tenant billing overview with metrics.
 * Only accessible by platform owners.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.trim() ?? ''
  const subscriptionStatusFilter = searchParams.get('subscriptionStatus') ?? 'all'
  const page = parsePositiveInteger(searchParams.get('page'), 1)
  const requestedPageSize = parsePositiveInteger(searchParams.get('pageSize'), 20)
  const pageSize = Math.min(requestedPageSize, 50)

  const supabaseAdmin = createAdminClient()

  // Load all tenants with billing data (not paginated yet, for metrics calculation)
  let tenantsQuery = supabaseAdmin
    .from('tenants')
    .select(
      'id, name, slug, status, subscription_status, subscription_period_end, stripe_customer_id, owner_locked_at'
    )
    .order('created_at', { ascending: false })

  if (query.length > 0) {
    const escapedQuery = query.replace(/[%_]/g, '\\$&')
    const pattern = `%${escapedQuery}%`
    tenantsQuery = tenantsQuery.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
  }

  const { data: allTenants, error: tenantsError } = await tenantsQuery

  if (tenantsError) {
    console.error('[GET /api/owner/billing] Tenants konnten nicht geladen werden:', tenantsError)
    return NextResponse.json(
      { error: 'Billing-Daten konnten nicht geladen werden.' },
      { status: 500 }
    )
  }

  const tenants = allTenants ?? []

  // Load module counts and prices for all tenants in one query
  const tenantIds = tenants.map((t) => t.id as string)
  let moduleCountMap = new Map<string, number>()
  let modulePriceMap = new Map<string, number>()

  if (tenantIds.length > 0) {
    const { data: moduleBookings } = await supabaseAdmin
      .from('tenant_modules')
      .select('tenant_id, status, modules!inner(stripe_price_id)')
      .in('tenant_id', tenantIds)
      .in('status', ['active', 'canceling'])

    if (moduleBookings) {
      for (const booking of moduleBookings) {
        const tid = booking.tenant_id as string
        moduleCountMap.set(tid, (moduleCountMap.get(tid) ?? 0) + 1)
      }
    }
  }

  // Load base plan price (once)
  let basePlanAmount = 0
  const basePlanPriceId = process.env.STRIPE_BASIS_PLAN_PRICE_ID
  if (basePlanPriceId) {
    try {
      const { stripe } = await import('@/lib/stripe')
      const price = await stripe.prices.retrieve(basePlanPriceId)
      basePlanAmount = price.unit_amount ?? 0
    } catch {
      basePlanAmount = 4900 // fallback
    }
  }

  // Load module price (all modules share the same price currently)
  let modulePriceAmount = 0
  try {
    const { data: firstModule } = await supabaseAdmin
      .from('modules')
      .select('stripe_price_id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (firstModule?.stripe_price_id) {
      const { stripe } = await import('@/lib/stripe')
      const price = await stripe.prices.retrieve(firstModule.stripe_price_id)
      modulePriceAmount = price.unit_amount ?? 0
    }
  } catch {
    // ignore
  }

  // Compute access state and billing info for each tenant
  type TenantBillingRecord = {
    id: string
    name: string
    slug: string
    tenantStatus: string
    subscriptionStatus: string
    moduleCount: number
    nextBillingAt: string | null
    totalAmount: number
    currency: string
    accessState: string
  }

  const enrichedTenants: TenantBillingRecord[] = tenants.map((t) => {
    const subStatus = (t.subscription_status as string) || 'none'
    const isOwnerLocked = t.owner_locked_at != null
    const tenantStatus = t.status as string

    let accessState = 'accessible'
    if (isOwnerLocked || tenantStatus === 'inactive') {
      accessState = 'manual_locked'
    } else if (['past_due', 'canceled', 'unpaid'].includes(subStatus)) {
      accessState = 'billing_blocked'
    }

    // Determine effective subscription status for display
    let displaySubStatus = subStatus
    if (subStatus === 'inactive') displaySubStatus = 'none'

    const modCount = moduleCountMap.get(t.id as string) ?? 0
    const hasActiveSub = ['active', 'canceling', 'past_due'].includes(subStatus)
    const totalAmount = hasActiveSub
      ? basePlanAmount + modCount * modulePriceAmount
      : 0

    return {
      id: t.id as string,
      name: t.name as string,
      slug: t.slug as string,
      tenantStatus,
      subscriptionStatus: displaySubStatus,
      moduleCount: modCount,
      nextBillingAt: (t.subscription_period_end as string) ?? null,
      totalAmount,
      currency: 'eur',
      accessState,
    }
  })

  // Compute metrics (before filtering)
  const metrics = {
    active: enrichedTenants.filter((t) => t.subscriptionStatus === 'active').length,
    pastDue: enrichedTenants.filter((t) => t.subscriptionStatus === 'past_due').length,
    canceling: enrichedTenants.filter((t) => t.subscriptionStatus === 'canceling').length,
    manualLocked: enrichedTenants.filter((t) => t.accessState === 'manual_locked').length,
  }

  // Apply subscription status filter
  let filtered = enrichedTenants
  if (subscriptionStatusFilter !== 'all') {
    if (subscriptionStatusFilter === 'none') {
      filtered = enrichedTenants.filter(
        (t) => t.subscriptionStatus === 'none' || t.subscriptionStatus === 'inactive'
      )
    } else {
      filtered = enrichedTenants.filter(
        (t) => t.subscriptionStatus === subscriptionStatusFilter
      )
    }
  }

  // Paginate
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize
  const paginated = filtered.slice(from, from + pageSize)

  return NextResponse.json({
    metrics,
    tenants: paginated,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  })
}
