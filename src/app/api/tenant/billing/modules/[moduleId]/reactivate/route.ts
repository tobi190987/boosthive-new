import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/tenant/billing/modules/[moduleId]/reactivate
 * Reverses a module cancellation by re-adding the subscription item to Stripe.
 * Only works while the module is in 'canceling' status and the period hasn't ended.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await params
  if (!UUID_REGEX.test(moduleId)) {
    return NextResponse.json({ error: 'Ungueltige Modul-ID.' }, { status: 400 })
  }

  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(`module-reactivate:${tenantId}:${getClientIp(request)}`, {
    limit: 10,
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

  // Load tenant subscription
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, stripe_subscription_id, subscription_status')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  const subscriptionId = tenant.stripe_subscription_id as string | null
  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Keine aktive Subscription vorhanden.' },
      { status: 400 }
    )
  }

  // Load the module booking
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('tenant_modules')
    .select('id, module_id, status, current_period_end')
    .eq('tenant_id', tenantId)
    .eq('module_id', moduleId)
    .maybeSingle()

  if (bookingError || !booking) {
    return NextResponse.json(
      { error: 'Modul-Buchung nicht gefunden.' },
      { status: 404 }
    )
  }

  if (booking.status !== 'canceling') {
    return NextResponse.json(
      { error: 'Nur Module in Kuendigung koennen reaktiviert werden.' },
      { status: 400 }
    )
  }

  // Check if the period has already ended
  if (booking.current_period_end) {
    const periodEnd = new Date(booking.current_period_end)
    if (periodEnd <= new Date()) {
      return NextResponse.json(
        { error: 'Die Kuendigungsfrist ist bereits abgelaufen. Bitte buche das Modul neu.' },
        { status: 400 }
      )
    }
  }

  // Load module for price ID
  const { data: mod, error: modError } = await supabaseAdmin
    .from('modules')
    .select('id, code, stripe_price_id')
    .eq('id', moduleId)
    .single()

  if (modError || !mod) {
    return NextResponse.json({ error: 'Modul nicht gefunden.' }, { status: 404 })
  }

  try {
    // Re-add the subscription item to Stripe (since we deleted it on cancel)
    const subscriptionItem = await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: mod.stripe_price_id,
      proration_behavior: 'none', // No proration since the user had access until period_end
      metadata: {
        tenant_id: tenantId,
        module_id: moduleId,
        module_code: mod.code,
      },
    })

    // Update DB: restore to active
    const { error: updateError } = await supabaseAdmin
      .from('tenant_modules')
      .update({
        status: 'active',
        cancel_at_period_end: false,
        stripe_subscription_item_id: subscriptionItem.id,
        current_period_end: subscriptionItem.current_period_end
          ? new Date(subscriptionItem.current_period_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    if (updateError) {
      console.error(
        '[POST /api/tenant/billing/modules/reactivate] DB-Update fehlgeschlagen:',
        updateError
      )
    }

    return NextResponse.json({ success: true })
  } catch (stripeError) {
    console.error(
      '[POST /api/tenant/billing/modules/reactivate] Stripe-Fehler:',
      stripeError
    )
    return NextResponse.json(
      { error: 'Modul-Reaktivierung fehlgeschlagen.' },
      { status: 500 }
    )
  }
}
