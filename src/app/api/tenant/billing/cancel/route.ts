import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

/**
 * POST /api/tenant/billing/cancel
 * Cancels the subscription at period end (cancel_at_period_end = true).
 */
export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
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
      { error: 'Kein aktives Abo vorhanden.' },
      { status: 400 }
    )
  }

  const currentStatus = tenant.subscription_status as string | null
  if (currentStatus !== 'active') {
    return NextResponse.json(
      { error: 'Nur aktive Abos koennen gekuendigt werden.' },
      { status: 400 }
    )
  }

  try {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })

    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({ subscription_status: 'canceling' })
      .eq('id', tenantId)

    if (updateError) {
      console.error('[POST /api/tenant/billing/cancel] DB-Update fehlgeschlagen:', updateError)
    }

    return NextResponse.json({ success: true })
  } catch (stripeError) {
    console.error('[POST /api/tenant/billing/cancel] Stripe-Fehler:', stripeError)
    return NextResponse.json(
      { error: 'Kuendigung konnte nicht durchgefuehrt werden.' },
      { status: 500 }
    )
  }
}
