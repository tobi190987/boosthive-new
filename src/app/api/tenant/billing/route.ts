import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42703'
}

/**
 * GET /api/tenant/billing
 * Returns the current billing / subscription state for the tenant.
 * Accessible by tenant members, but only admins receive payment-method details
 * and mutable billing context. Members get the module catalog for dashboard gating.
 */
export async function GET(request: NextRequest) {
  const tenantIdFromHeader = request.headers.get('x-tenant-id')
  const tenantSlugFromHeader = request.headers.get('x-tenant-slug')
  if (!tenantIdFromHeader) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(`billing-get:${tenantIdFromHeader}:${getClientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warte einen Moment.' },
      { status: 429 }
    )
  }

  const authResult = await requireTenantUser(tenantIdFromHeader)
  if ('error' in authResult) return authResult.error
  const tenantId = authResult.auth.tenantId ?? tenantIdFromHeader
  const isAdmin = authResult.auth.role === 'admin'

  const supabaseAdmin = createAdminClient()

  let { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select(
      'stripe_customer_id, stripe_subscription_id, subscription_status, subscription_period_end'
    )
    .eq('id', tenantId)
    .maybeSingle()

  // Local dev can inject fallback tenant IDs for arbitrary *.localhost hosts.
  // If that happens, prefer resolving the real tenant by the verified slug header.
  if ((!tenant || tenantError) && tenantSlugFromHeader) {
    const fallbackLookup = await supabaseAdmin
      .from('tenants')
      .select(
        'stripe_customer_id, stripe_subscription_id, subscription_status, subscription_period_end'
      )
      .eq('slug', tenantSlugFromHeader)
      .maybeSingle()

    tenant = fallbackLookup.data
    tenantError = fallbackLookup.error
  }

  if (isMissingColumnError(tenantError)) {
    console.warn(
      '[GET /api/tenant/billing] Stripe-/Subscription-Spalten fehlen lokal. Liefere Fallback-Billingstatus.'
    )

    return NextResponse.json({
      subscription_status: 'none',
      subscription_period_end: null,
      payment_method: null,
      plan: null,
      modules: [],
    })
  }

  if (tenantError || !tenant) {
    console.error('[GET /api/tenant/billing] Tenant nicht gefunden:', tenantError)
    return NextResponse.json(
      { error: 'Tenant nicht gefunden.' },
      { status: 404 }
    )
  }

  // Map DB status to frontend status
  let subscriptionStatus: 'none' | 'active' | 'past_due' | 'canceled' | 'canceling' = 'none'
  const dbStatus = tenant.subscription_status as string | null

  if (dbStatus === 'active') subscriptionStatus = 'active'
  else if (dbStatus === 'canceling') subscriptionStatus = 'canceling'
  else if (dbStatus === 'past_due') subscriptionStatus = 'past_due'
  else if (dbStatus === 'canceled') subscriptionStatus = 'canceled'

  // Load payment method from Stripe only for admins.
  let paymentMethod: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  } | null = null

  if (isAdmin && tenant.stripe_customer_id) {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: tenant.stripe_customer_id,
        type: 'card',
        limit: 1,
      })

      const card = paymentMethods.data[0]?.card
      if (card) {
        paymentMethod = {
          brand: card.brand,
          last4: card.last4,
          exp_month: card.exp_month,
          exp_year: card.exp_year,
        }
      }
    } catch (stripeError) {
      console.error('[GET /api/tenant/billing] Stripe PaymentMethod-Abfrage fehlgeschlagen:', stripeError)
      // Non-fatal — we still return the rest of the billing data
    }
  }

  // Plan info is only shown in the admin billing workspace.
  let plan: { name: string; amount: number; currency: string; interval: string } | null = null
  if (isAdmin && subscriptionStatus !== 'none') {
    const priceId = process.env.STRIPE_BASIS_PLAN_PRICE_ID
    if (priceId) {
      try {
        const price = await stripe.prices.retrieve(priceId)
        const rec = price.recurring
        const intervalUnitDe = (unit: string) => {
          if (unit === 'day') return 'Tag'
          if (unit === 'week') return 'Woche'
          if (unit === 'month') return 'Monat'
          if (unit === 'year') return 'Jahr'
          return unit
        }
        const intervalLabel = rec
          ? rec.interval_count === 4 && rec.interval === 'week'
            ? '4 Wochen'
            : `${rec.interval_count} ${intervalUnitDe(rec.interval)}`
          : '4 Wochen'
        plan = {
          name: 'Basis-Plan',
          amount: price.unit_amount ?? 4900,
          currency: price.currency,
          interval: intervalLabel,
        }
      } catch (priceError) {
        console.error('[GET /api/tenant/billing] Stripe Preis-Abfrage fehlgeschlagen:', priceError)
        // Fall back to static values so the UI still renders
        plan = { name: 'Basis-Plan', amount: 4900, currency: 'eur', interval: '4 Wochen' }
      }
    } else {
      plan = { name: 'Basis-Plan', amount: 4900, currency: 'eur', interval: '4 Wochen' }
    }
  }

  // Load module catalog and tenant bookings for module section
  let modules: {
    id: string
    code: string
    name: string
    description: string
    price: number
    currency: string
    status: 'active' | 'canceling' | 'canceled' | 'not_subscribed'
    current_period_end: string | null
  }[] = []

  try {
    // Load all active modules from the catalog
    const { data: allModules, error: modulesError } = await supabaseAdmin
      .from('modules')
      .select('id, code, name, description, stripe_price_id, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (!modulesError && allModules) {
      // Load this tenant's module bookings
      const { data: tenantBookings } = await supabaseAdmin
        .from('tenant_modules')
        .select('module_id, status, current_period_end')
        .eq('tenant_id', tenantId)

      const bookingMap = new Map(
        (tenantBookings ?? []).map((b: { module_id: string; status: string; current_period_end: string | null }) => [
          b.module_id,
          b,
        ])
      )

      // Load module prices from Stripe (deduplicated by price ID)
      const priceCache = new Map<string, { amount: number; currency: string }>()

      for (const mod of allModules) {
        if (!priceCache.has(mod.stripe_price_id)) {
          try {
            const price = await stripe.prices.retrieve(mod.stripe_price_id)
            priceCache.set(mod.stripe_price_id, {
              amount: price.unit_amount ?? 0,
              currency: price.currency,
            })
          } catch {
            priceCache.set(mod.stripe_price_id, { amount: 0, currency: 'eur' })
          }
        }
      }

      modules = allModules.map((mod) => {
        const booking = bookingMap.get(mod.id) as { status: string; current_period_end: string | null } | undefined
        const priceInfo = priceCache.get(mod.stripe_price_id) ?? { amount: 0, currency: 'eur' }

        let moduleStatus: 'active' | 'canceling' | 'canceled' | 'not_subscribed' = 'not_subscribed'
        if (booking) {
          if (booking.status === 'active') moduleStatus = 'active'
          else if (booking.status === 'canceling') moduleStatus = 'canceling'
          // canceled = available to rebook, show as not_subscribed
        }

        return {
          id: mod.id,
          code: mod.code,
          name: mod.name,
          description: mod.description,
          price: priceInfo.amount,
          currency: priceInfo.currency,
          status: moduleStatus,
          current_period_end: booking?.current_period_end ?? null,
        }
      })
    }
  } catch (moduleLoadError) {
    // Non-fatal: modules section will just be empty
    console.error('[GET /api/tenant/billing] Modul-Daten konnten nicht geladen werden:', moduleLoadError)
  }

  return NextResponse.json({
    subscription_status: subscriptionStatus,
    subscription_period_end: tenant.subscription_period_end ?? null,
    payment_method: isAdmin ? paymentMethod : null,
    plan: isAdmin ? plan : null,
    modules,
  })
}
