import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/owner-auth'
import {
  normalizeSubscriptionDisplayStatus,
  resolveOwnerBillingAccessState,
  type OwnerBillingAccessFilter,
} from '@/lib/owner-billing'
import {
  checkRateLimit,
  getClientIp,
  OWNER_READ,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase-admin'

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseAccessFilter(value: string | null): OwnerBillingAccessFilter {
  switch (value) {
    case 'accessible':
    case 'manual_locked':
    case 'billing_blocked':
      return value
    default:
      return 'all'
  }
}

function applyTenantSearch<T extends { or: (filters: string) => T }>(query: T, rawQuery: string) {
  if (rawQuery.length === 0) return query

  const escapedQuery = rawQuery.replace(/[%_]/g, '\\$&')
  const pattern = `%${escapedQuery}%`
  return query.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
}

function applySubscriptionFilter<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  subscriptionStatusFilter: string,
  subscriptionStatusAvailable: boolean
) {
  if (subscriptionStatusFilter === 'all') return query
  if (!subscriptionStatusAvailable) {
    return subscriptionStatusFilter === 'none'
      ? query
      : query.eq('id', '00000000-0000-0000-0000-000000000000')
  }
  if (subscriptionStatusFilter === 'none') {
    return query.eq('subscription_status', 'inactive')
  }
  return query.eq('subscription_status', subscriptionStatusFilter)
}

function applyAccessFilter<
  T extends {
    eq: (column: string, value: string) => T
    is: (column: string, value: null) => T
    neq: (column: string, value: string) => T
    in: (column: string, values: string[]) => T
    or: (filters: string) => T
  },
>(
  query: T,
  accessFilter: OwnerBillingAccessFilter,
  subscriptionStatusAvailable: boolean,
  ownerLockAvailable: boolean
) {
  switch (accessFilter) {
    case 'manual_locked':
      return ownerLockAvailable
        ? query.or('owner_locked_at.not.is.null,status.eq.inactive')
        : query.eq('status', 'inactive')
    case 'billing_blocked':
      if (!subscriptionStatusAvailable) {
        return query.eq('id', '00000000-0000-0000-0000-000000000000')
      }
      if (!ownerLockAvailable) {
        return query
          .neq('status', 'inactive')
          .in('subscription_status', ['past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'])
      }
      return query
        .is('owner_locked_at', null)
        .neq('status', 'inactive')
        .in('subscription_status', ['past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'])
    case 'accessible':
      if (!subscriptionStatusAvailable) {
        return ownerLockAvailable
          ? query.is('owner_locked_at', null).neq('status', 'inactive')
          : query.neq('status', 'inactive')
      }
      if (!ownerLockAvailable) {
        return query
          .neq('status', 'inactive')
          .or(
            'subscription_status.is.null,subscription_status.eq.inactive,subscription_status.eq.active,subscription_status.eq.canceling'
          )
      }
      return query
        .is('owner_locked_at', null)
        .neq('status', 'inactive')
        .or(
          'subscription_status.is.null,subscription_status.eq.inactive,subscription_status.eq.active,subscription_status.eq.canceling'
        )
    default:
      return query
  }
}

async function loadCount(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  query: string,
  subscriptionStatusAvailable: boolean,
  ownerLockAvailable: boolean,
  config: {
    subscriptionStatus?: string
    access?: OwnerBillingAccessFilter
  } = {}
) {
  let countQuery = supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true })
  countQuery = applyTenantSearch(countQuery, query)
  if (config.subscriptionStatus) {
    countQuery = applySubscriptionFilter(
      countQuery,
      config.subscriptionStatus,
      subscriptionStatusAvailable
    )
  }
  if (config.access && config.access !== 'all') {
    countQuery = applyAccessFilter(
      countQuery,
      config.access,
      subscriptionStatusAvailable,
      ownerLockAvailable
    )
  }

  const { count, error } = await countQuery
  if (error) throw error
  return count ?? 0
}

/**
 * GET /api/owner/billing
 * Returns paginated tenant billing overview with metrics.
 * Only accessible by platform owners.
 */
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`owner-billing:${getClientIp(request)}`, OWNER_READ)
  if (!rl.allowed) {
    return rateLimitResponse(rl)
  }

  const auth = await requireOwner()
  if ('error' in auth) return auth.error

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.trim() ?? ''
  const subscriptionStatusFilter = searchParams.get('subscriptionStatus') ?? 'all'
  const accessFilter = parseAccessFilter(searchParams.get('access'))
  const page = parsePositiveInteger(searchParams.get('page'), 1)
  const requestedPageSize = parsePositiveInteger(searchParams.get('pageSize'), 20)
  const pageSize = Math.min(requestedPageSize, 50)

  const supabaseAdmin = createAdminClient()

  try {
    const subscriptionStatusProbe = await supabaseAdmin
      .from('tenants')
      .select('subscription_status, subscription_period_end', { head: true, count: 'exact' })
    const ownerLockProbe = await supabaseAdmin
      .from('tenants')
      .select('owner_locked_at', { head: true, count: 'exact' })
    const subscriptionStatusAvailable = !subscriptionStatusProbe.error
    const ownerLockAvailable = !ownerLockProbe.error

    const metricsPromise = Promise.all([
      loadCount(supabaseAdmin, query, subscriptionStatusAvailable, ownerLockAvailable, {
        subscriptionStatus: 'active',
      }),
      loadCount(supabaseAdmin, query, subscriptionStatusAvailable, ownerLockAvailable, {
        subscriptionStatus: 'past_due',
      }),
      loadCount(supabaseAdmin, query, subscriptionStatusAvailable, ownerLockAvailable, {
        subscriptionStatus: 'canceling',
      }),
      loadCount(supabaseAdmin, query, subscriptionStatusAvailable, ownerLockAvailable, {
        access: 'manual_locked',
      }),
    ])

    let totalQuery = supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true })
    totalQuery = applyTenantSearch(totalQuery, query)
    totalQuery = applySubscriptionFilter(totalQuery, subscriptionStatusFilter, subscriptionStatusAvailable)
    totalQuery = applyAccessFilter(
      totalQuery,
      accessFilter,
      subscriptionStatusAvailable,
      ownerLockAvailable
    )

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let tenantsQuery = supabaseAdmin
      .from('tenants')
      .select(
        subscriptionStatusAvailable
          ? ownerLockAvailable
            ? 'id, name, slug, status, subscription_status, subscription_period_end, owner_locked_at'
            : 'id, name, slug, status, subscription_status, subscription_period_end'
          : ownerLockAvailable
            ? 'id, name, slug, status, owner_locked_at'
            : 'id, name, slug, status'
      )
      .order('created_at', { ascending: false })
    tenantsQuery = applyTenantSearch(tenantsQuery, query)
    tenantsQuery = applySubscriptionFilter(
      tenantsQuery,
      subscriptionStatusFilter,
      subscriptionStatusAvailable
    )
    tenantsQuery = applyAccessFilter(
      tenantsQuery,
      accessFilter,
      subscriptionStatusAvailable,
      ownerLockAvailable
    )

    const [{ count: total, error: totalError }, { data: tenants, error: tenantsError }, metrics] =
      await Promise.all([totalQuery, tenantsQuery.range(from, to), metricsPromise])

    if (totalError || tenantsError) {
      console.error(
        '[GET /api/owner/billing] Tenants konnten nicht geladen werden:',
        totalError ?? tenantsError
      )
      return NextResponse.json(
        { error: 'Billing-Daten konnten nicht geladen werden.' },
        { status: 500 }
      )
    }

    const paginatedTenants = tenants ?? []
    const tenantIds = paginatedTenants.map((tenant) => tenant.id as string)

    let basePlanAmount = 4900
    if (process.env.STRIPE_BASIS_PLAN_PRICE_ID) {
      try {
        const { stripe } = await import('@/lib/stripe')
        const price = await stripe.prices.retrieve(process.env.STRIPE_BASIS_PLAN_PRICE_ID)
        basePlanAmount = price.unit_amount ?? 4900
      } catch {
        basePlanAmount = 4900
      }
    }

    const moduleCountMap = new Map<string, number>()
    const modulePriceTotalMap = new Map<string, number>()
    const priceCache = new Map<string, number>()

    if (tenantIds.length > 0) {
      const { data: moduleBookings, error: moduleBookingsError } = await supabaseAdmin
        .from('tenant_modules')
        .select('tenant_id, status, modules!inner(stripe_price_id)')
        .in('tenant_id', tenantIds)
        .in('status', ['active', 'canceling'])

      if (moduleBookingsError) {
        console.error('[GET /api/owner/billing] Module konnten nicht geladen werden:', moduleBookingsError)
      } else {
        const priceIds = Array.from(
          new Set(
            (moduleBookings ?? [])
              .map(
                (booking) =>
                  (booking.modules as { stripe_price_id?: string | null } | null)?.stripe_price_id ?? null
              )
              .filter((value): value is string => Boolean(value))
          )
        )

        if (priceIds.length > 0) {
          try {
            const { stripe } = await import('@/lib/stripe')
            await Promise.all(
              priceIds.map(async (priceId) => {
                const price = await stripe.prices.retrieve(priceId)
                priceCache.set(priceId, price.unit_amount ?? 0)
              })
            )
          } catch (priceError) {
            console.error('[GET /api/owner/billing] Stripe Preis-Abfrage fehlgeschlagen:', priceError)
          }
        }

        for (const booking of moduleBookings ?? []) {
          const tenantId = booking.tenant_id as string
          const priceId =
            (booking.modules as { stripe_price_id?: string | null } | null)?.stripe_price_id ?? null

          moduleCountMap.set(tenantId, (moduleCountMap.get(tenantId) ?? 0) + 1)
          modulePriceTotalMap.set(
            tenantId,
            (modulePriceTotalMap.get(tenantId) ?? 0) + (priceId ? priceCache.get(priceId) ?? 0 : 0)
          )
        }
      }
    }

    const enrichedTenants = paginatedTenants.map((tenant) => {
      const rawSubscriptionStatus = (tenant.subscription_status as string | null | undefined) ?? null
      const subscriptionStatus = normalizeSubscriptionDisplayStatus(rawSubscriptionStatus)
      const accessState = resolveOwnerBillingAccessState({
        status: (tenant.status as string | null | undefined) ?? null,
        subscription_status: rawSubscriptionStatus,
        owner_locked_at: (tenant.owner_locked_at as string | null | undefined) ?? null,
      })
      const moduleCount = moduleCountMap.get(tenant.id as string) ?? 0
      const hasActiveSub = ['active', 'canceling', 'past_due'].includes(rawSubscriptionStatus ?? '')
      const totalAmount = hasActiveSub
        ? basePlanAmount + (modulePriceTotalMap.get(tenant.id as string) ?? 0)
        : 0

      return {
        id: tenant.id as string,
        name: tenant.name as string,
        slug: tenant.slug as string,
        tenantStatus: tenant.status as string,
        subscriptionStatus,
        moduleCount,
        nextBillingAt: (tenant.subscription_period_end as string) ?? null,
        totalAmount,
        currency: 'eur',
        accessState,
      }
    })

    const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))

    return NextResponse.json({
      metrics: {
        active: metrics[0],
        pastDue: metrics[1],
        canceling: metrics[2],
        manualLocked: metrics[3],
      },
      tenants: enrichedTenants,
      pagination: {
        page,
        pageSize,
        total: total ?? 0,
        totalPages,
      },
    })
  } catch (error) {
    console.error('[GET /api/owner/billing] Billing-Daten konnten nicht geladen werden:', error)
    return NextResponse.json(
      { error: 'Billing-Daten konnten nicht geladen werden.' },
      { status: 500 }
    )
  }
}
