import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'

/**
 * POST /api/tenant/billing/setup-intent
 * Creates a Stripe SetupIntent so the frontend can collect card details via Stripe Elements.
 * If the tenant does not yet have a Stripe Customer, one is created first (fallback).
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
    .select('id, name, slug, stripe_customer_id')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    console.error('[POST /api/tenant/billing/setup-intent] Tenant nicht gefunden:', tenantError)
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  let stripeCustomerId = tenant.stripe_customer_id as string | null

  // Fallback: create Stripe Customer if none exists yet
  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: {
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
        },
      })
      stripeCustomerId = customer.id

      const { error: updateError } = await supabaseAdmin
        .from('tenants')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', tenantId)

      if (updateError) {
        console.error(
          '[POST /api/tenant/billing/setup-intent] stripe_customer_id konnte nicht gespeichert werden:',
          updateError
        )
      }
    } catch (stripeError) {
      console.error('[POST /api/tenant/billing/setup-intent] Stripe Customer Erstellung fehlgeschlagen:', stripeError)
      return NextResponse.json(
        { error: 'Stripe Customer konnte nicht erstellt werden.' },
        { status: 500 }
      )
    }
  }

  // Create SetupIntent
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
    })

    return NextResponse.json({ client_secret: setupIntent.client_secret })
  } catch (stripeError) {
    console.error('[POST /api/tenant/billing/setup-intent] SetupIntent Erstellung fehlgeschlagen:', stripeError)
    return NextResponse.json(
      { error: 'SetupIntent konnte nicht erstellt werden.' },
      { status: 500 }
    )
  }
}
