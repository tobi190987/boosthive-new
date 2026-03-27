import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

/**
 * GET /api/tenant/billing
 * Returns the current billing / subscription state for the tenant.
 * Only accessible by tenant admins.
 */
export async function GET(request: NextRequest) {
  const tenantIdFromHeader = request.headers.get('x-tenant-id')
  if (!tenantIdFromHeader) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantAdmin(tenantIdFromHeader)
  if ('error' in authResult) return authResult.error
  const tenantId = authResult.auth.tenantId ?? tenantIdFromHeader

  const supabaseAdmin = createAdminClient()

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select(
      'stripe_customer_id, stripe_subscription_id, subscription_status, subscription_period_end'
    )
    .eq('id', tenantId)
    .single()

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

  // Load payment method from Stripe if customer exists
  let paymentMethod: {
    brand: string
    last4: string
    exp_month: number
    exp_year: number
  } | null = null

  if (tenant.stripe_customer_id) {
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

  // Plan info (static for now — single Basis-Plan)
  const plan =
    subscriptionStatus !== 'none'
      ? {
          name: 'Basis-Plan',
          amount: 4900, // 49.00 EUR in cents — adjust if needed
          currency: 'eur',
          interval: '4 Wochen',
        }
      : null

  return NextResponse.json({
    subscription_status: subscriptionStatus,
    subscription_period_end: tenant.subscription_period_end ?? null,
    payment_method: paymentMethod,
    plan,
  })
}
