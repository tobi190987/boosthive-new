import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/tenant/billing/modules/[moduleId]/cancel
 * Cancels a module booking at period end.
 * Uses subscriptionItems.del() to remove the item immediately from Stripe.
 * The DB status transitions to 'canceling' until period_end, when it becomes 'canceled'.
 * (Variante 2 per user decision)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await params
  if (!UUID_REGEX.test(moduleId)) {
    return NextResponse.json({ error: 'Ungültige Modul-ID.' }, { status: 400 })
  }

  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(`module-cancel:${tenantId}:${getClientIp(request)}`, {
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

  // Load the tenant module booking
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('tenant_modules')
    .select('id, module_id, stripe_subscription_item_id, status, current_period_end')
    .eq('tenant_id', tenantId)
    .eq('module_id', moduleId)
    .maybeSingle()

  if (bookingError || !booking) {
    return NextResponse.json(
      { error: 'Modul-Buchung nicht gefunden.' },
      { status: 404 }
    )
  }

  if (booking.status !== 'active') {
    return NextResponse.json(
      { error: 'Nur aktive Module können abbestellt werden.' },
      { status: 400 }
    )
  }

  const stripeItemId = booking.stripe_subscription_item_id as string | null
  if (!stripeItemId) {
    return NextResponse.json(
      { error: 'Keine Stripe-Subscription-Item-ID vorhanden.' },
      { status: 400 }
    )
  }

  try {
    // Variante 2: Delete the subscription item immediately from Stripe.
    // Stripe will prorate the unused time as a credit.
    // The module remains usable until current_period_end in our DB.
    await stripe.subscriptionItems.del(stripeItemId, {
      proration_behavior: 'create_prorations',
    })

    // Update DB: mark as canceling until period_end
    const { error: updateError } = await supabaseAdmin
      .from('tenant_modules')
      .update({
        status: 'canceling',
        cancel_at_period_end: true,
        stripe_subscription_item_id: null, // Item no longer exists in Stripe
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    if (updateError) {
      console.error(
        '[POST /api/tenant/billing/modules/cancel] DB-Update fehlgeschlagen:',
        updateError
      )
    }

    return NextResponse.json({ success: true })
  } catch (stripeError) {
    console.error(
      '[POST /api/tenant/billing/modules/cancel] Stripe-Fehler:',
      stripeError
    )
    return NextResponse.json(
      { error: 'Modul-Kündigung konnte nicht durchgeführt werden.' },
      { status: 500 }
    )
  }
}
