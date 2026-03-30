import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * POST /api/tenant/billing/reactivate
 * Reverses a pending cancellation (sets cancel_at_period_end back to false).
 */
export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const rl = checkRateLimit(`reactivate:${tenantId}:${getClientIp(request)}`, {
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
      { error: 'Kein Abo vorhanden.' },
      { status: 400 }
    )
  }

  const currentStatus = tenant.subscription_status as string | null
  if (currentStatus !== 'canceling') {
    return NextResponse.json(
      { error: 'Nur Abos in Kündigung können reaktiviert werden.' },
      { status: 400 }
    )
  }

  try {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    })

    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({ subscription_status: 'active' })
      .eq('id', tenantId)

    if (updateError) {
      console.error('[POST /api/tenant/billing/reactivate] DB-Update fehlgeschlagen:', updateError)
    }

    return NextResponse.json({ success: true })
  } catch (stripeError) {
    console.error('[POST /api/tenant/billing/reactivate] Stripe-Fehler:', stripeError)
    return NextResponse.json(
      { error: 'Reaktivierung fehlgeschlagen.' },
      { status: 500 }
    )
  }
}
