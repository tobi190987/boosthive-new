import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const BASIS_PLAN_PRICE_ID = process.env.STRIPE_BASIS_PLAN_PRICE_ID

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/tenant/billing/subscribe
 * Starts a Basis-Plan subscription including at least one module.
 * All items are created in a single Stripe subscription call.
 * Body: { module_ids: string[] }  — at least one required
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

  // Parse and validate body
  let moduleIds: string[] = []
  try {
    const body = await request.json()
    moduleIds = Array.isArray(body?.module_ids) ? body.module_ids : []
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  moduleIds = moduleIds.filter((id) => UUID_REGEX.test(id))
  if (moduleIds.length === 0) {
    return NextResponse.json(
      { error: 'Mindestens ein Modul muss ausgewählt werden.' },
      { status: 400 }
    )
  }

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

  const currentStatus = tenant.subscription_status as string | null
  if (currentStatus === 'active' || currentStatus === 'canceling') {
    return NextResponse.json(
      { error: 'Es besteht bereits ein aktives Abo.' },
      { status: 409 }
    )
  }

  // Load selected modules
  const { data: selectedModules, error: modulesError } = await supabaseAdmin
    .from('modules')
    .select('id, code, name, stripe_price_id, is_active')
    .in('id', moduleIds)

  if (modulesError || !selectedModules || selectedModules.length === 0) {
    return NextResponse.json({ error: 'Module konnten nicht geladen werden.' }, { status: 400 })
  }

  const inactiveModule = selectedModules.find((m) => !m.is_active)
  if (inactiveModule) {
    return NextResponse.json(
      { error: `Modul "${inactiveModule.name}" ist aktuell nicht buchbar.` },
      { status: 400 }
    )
  }

  try {
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

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: defaultPm.id },
    })

    // Create subscription with Basis-Plan + all selected modules in one call
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        { price: BASIS_PLAN_PRICE_ID },
        ...selectedModules.map((m) => ({
          price: m.stripe_price_id,
          metadata: { module_id: m.id, module_code: m.code },
        })),
      ],
      default_payment_method: defaultPm.id,
      metadata: { tenant_id: tenantId },
    })

    const basisItem = subscription.items.data.find((i) => i.price.id === BASIS_PLAN_PRICE_ID)
    const periodEnd = basisItem?.current_period_end ?? subscription.items.data[0]?.current_period_end ?? null
    const periodEndISO = periodEnd ? new Date(periodEnd * 1000).toISOString() : null

    // Update tenant
    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: 'active',
        subscription_period_end: periodEndISO,
        status: 'active',
      })
      .eq('id', tenantId)

    if (updateError) {
      console.error('[POST /api/tenant/billing/subscribe] DB-Update fehlgeschlagen:', updateError)
    }

    // Upsert each module into tenant_modules
    for (const mod of selectedModules) {
      const stripeItem = subscription.items.data.find(
        (i) => i.metadata?.module_id === mod.id
      )
      const itemPeriodEnd = stripeItem?.current_period_end
        ? new Date(stripeItem.current_period_end * 1000).toISOString()
        : periodEndISO

      const { error: upsertError } = await supabaseAdmin
        .from('tenant_modules')
        .upsert(
          {
            tenant_id: tenantId,
            module_id: mod.id,
            stripe_subscription_item_id: stripeItem?.id ?? null,
            status: 'active',
            cancel_at_period_end: false,
            current_period_end: itemPeriodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,module_id' }
        )

      if (upsertError) {
        console.error(
          `[POST /api/tenant/billing/subscribe] Modul-Upsert fehlgeschlagen (${mod.code}):`,
          upsertError
        )
      }
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
