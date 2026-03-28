import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const BASIS_PLAN_PRICE_ID = process.env.STRIPE_BASIS_PLAN_PRICE_ID

/**
 * POST /api/tenant/billing/subscribe
 * Starts a Basis-Plan subscription for the tenant.
 * The tenant must already have a Stripe Customer and a default payment method
 * (set up via the SetupIntent / Card Element flow).
 */
export async function POST(request: NextRequest) {
  if (!BASIS_PLAN_PRICE_ID) {
    console.error('[POST /api/tenant/billing/subscribe] STRIPE_BASIS_PLAN_PRICE_ID nicht gesetzt.')
    return NextResponse.json(
      { error: 'Stripe Preis-ID ist nicht konfiguriert.' },
      { status: 500 }
    )
  }

  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(`subscribe:${tenantId}:${getClientIp(request)}`, {
    limit: 5,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warte einen Moment.' },
      { status: 429 }
    )
  }

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const supabaseAdmin = createAdminClient()

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  const stripeCustomerId = tenant.stripe_customer_id as string | null
  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: 'Kein Stripe Customer vorhanden. Bitte zuerst eine Zahlungsmethode hinterlegen.' },
      { status: 400 }
    )
  }

  // Prevent double subscription
  const currentStatus = tenant.subscription_status as string | null
  if (currentStatus === 'active' || currentStatus === 'canceling') {
    return NextResponse.json(
      { error: 'Es besteht bereits ein aktives Abo.' },
      { status: 409 }
    )
  }

  try {
    // Ensure a default payment method is set on the customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
      limit: 1,
    })

    const defaultPm = paymentMethods.data[0]
    if (!defaultPm) {
      return NextResponse.json(
        { error: 'Keine Zahlungsmethode hinterlegt. Bitte zuerst eine Karte speichern.' },
        { status: 400 }
      )
    }

    // Set as default for invoices
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: defaultPm.id,
      },
    })

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: BASIS_PLAN_PRICE_ID }],
      default_payment_method: defaultPm.id,
      metadata: {
        tenant_id: tenantId,
      },
    })

    // In Stripe SDK v21, current_period_end lives on the subscription item
    const periodEnd = subscription.items.data[0]?.current_period_end ?? null
    const periodEndISO = periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null

    // Update tenant in DB — set is_active:true immediately so re-subscriptions
    // take effect without waiting for the async invoice.payment_succeeded webhook.
    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: 'active',
        subscription_period_end: periodEndISO,
        is_active: true,
      })
      .eq('id', tenantId)

    if (updateError) {
      console.error(
        '[POST /api/tenant/billing/subscribe] DB-Update fehlgeschlagen:',
        updateError
      )
      // Subscription was created in Stripe — the webhook will eventually sync the state
    }

    return NextResponse.json({
      subscription_id: subscription.id,
      status: subscription.status,
      current_period_end: periodEndISO,
    })
  } catch (stripeError) {
    console.error('[POST /api/tenant/billing/subscribe] Stripe-Fehler:', stripeError)
    return NextResponse.json(
      { error: 'Abo konnte nicht erstellt werden.' },
      { status: 500 }
    )
  }
}
