import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

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

  const rl = checkRateLimit(`setup-intent:${tenantId}:${getClientIp(request)}`, {
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
    .select('id, name, slug, stripe_customer_id')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError) {
    const isColumnMissing =
      tenantError.code === '42703' ||
      tenantError.code === 'PGRST204' ||
      (typeof tenantError.message === 'string' && tenantError.message.includes('stripe_customer_id'))
    if (isColumnMissing) {
      console.error('[POST /api/tenant/billing/setup-intent] Stripe-Spalten fehlen — Migration 008 noch nicht angewandt:', tenantError)
      return NextResponse.json(
        { error: 'Stripe-Konfiguration unvollständig. Bitte wende dich an den Support.' },
        { status: 500 }
      )
    }
    console.error('[POST /api/tenant/billing/setup-intent] Datenbank-Fehler:', tenantError)
    return NextResponse.json({ error: 'Interner Fehler. Bitte versuche es später erneut.' }, { status: 500 })
  }

  if (!tenant) {
    console.error('[POST /api/tenant/billing/setup-intent] Tenant nicht gefunden für ID:', tenantId)
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  let stripeCustomerId = tenant.stripe_customer_id as string | null

  // Fetch user email so Stripe can send invoice emails
  const { data: { user: adminUser } } = await supabaseAdmin.auth.admin.getUserById(authResult.auth.userId)
  const userEmail = adminUser?.email ?? undefined

  // Fallback: create Stripe Customer if none exists yet
  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        name: tenant.name,
        email: userEmail,
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

  // Ensure email is set on existing customer (for invoice delivery)
  if (stripeCustomerId && userEmail) {
    try {
      const existing = await stripe.customers.retrieve(stripeCustomerId)
      if (!('deleted' in existing) && !existing.email) {
        await stripe.customers.update(stripeCustomerId, { email: userEmail })
      }
    } catch {
      // Non-fatal
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
