import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { stripe } from '@/lib/stripe'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendModuleBooked } from '@/lib/email'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/tenant/billing/modules/[moduleId]/subscribe
 * Adds a module as a new Subscription Item to the tenant's existing subscription.
 * Requires active Basis-Plan subscription. Stripe proration is applied automatically.
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

  const rl = checkRateLimit(`module-subscribe:${tenantId}:${getClientIp(request)}`, {
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

  // 1. Load tenant with subscription data
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant nicht gefunden.' }, { status: 404 })
  }

  // Must have active subscription
  const subStatus = tenant.subscription_status as string | null
  if (subStatus !== 'active' && subStatus !== 'canceling') {
    return NextResponse.json(
      { error: 'Ein aktiver Basis-Plan ist erforderlich, um Module zu buchen.' },
      { status: 400 }
    )
  }

  const subscriptionId = tenant.stripe_subscription_id as string | null
  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Keine aktive Subscription vorhanden.' },
      { status: 400 }
    )
  }

  // 2. Load the module from the catalog
  const { data: mod, error: modError } = await supabaseAdmin
    .from('modules')
    .select('id, code, name, description, stripe_price_id, is_active')
    .eq('id', moduleId)
    .single()

  if (modError || !mod) {
    return NextResponse.json({ error: 'Modul nicht gefunden.' }, { status: 404 })
  }

  if (!mod.is_active) {
    return NextResponse.json(
      { error: 'Dieses Modul ist aktuell nicht buchbar.' },
      { status: 400 }
    )
  }

  // 3. Check for existing booking (prevent double subscription)
  const { data: existingBooking } = await supabaseAdmin
    .from('tenant_modules')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('module_id', moduleId)
    .maybeSingle()

  if (existingBooking) {
    if (existingBooking.status === 'active') {
      return NextResponse.json(
        { error: 'Dieses Modul ist bereits gebucht.' },
        { status: 409 }
      )
    }
    if (existingBooking.status === 'canceling') {
      return NextResponse.json(
        { error: 'Dieses Modul laeuft gerade aus. Bitte nutze "Kuendigung aufheben" statt einer Neubuchung.' },
        { status: 409 }
      )
    }
    // Status 'canceled' -> allow rebooking by deleting the old record first
    if (existingBooking.status === 'canceled') {
      // Keep for audit trail but update it
    }
  }

  // 4. Add Subscription Item to Stripe
  try {
    const subscriptionItem = await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: mod.stripe_price_id,
      proration_behavior: 'create_prorations',
      metadata: {
        tenant_id: tenantId,
        module_id: moduleId,
        module_code: mod.code,
      },
    })

    // 5. Upsert into tenant_modules (optimistic write)
    const { error: upsertError } = await supabaseAdmin
      .from('tenant_modules')
      .upsert(
        {
          tenant_id: tenantId,
          module_id: moduleId,
          stripe_subscription_item_id: subscriptionItem.id,
          status: 'active',
          cancel_at_period_end: false,
          current_period_end: subscriptionItem.current_period_end
            ? new Date(subscriptionItem.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,module_id' }
      )

    if (upsertError) {
      console.error(
        '[POST /api/tenant/billing/modules/subscribe] DB-Upsert fehlgeschlagen:',
        upsertError
      )
      // Non-fatal: webhook will eventually sync
    }

    // Send booking confirmation email (non-fatal)
    try {
      const { data: { user: adminUser } } = await supabaseAdmin.auth.admin.getUserById(authResult.auth.userId)
      if (adminUser?.email) {
        let priceFormatted = '–'
        try {
          const price = await stripe.prices.retrieve(mod.stripe_price_id)
          let amount = price.unit_amount
          if (amount === null && Array.isArray((price as any).tiers) && (price as any).tiers.length > 0) {
            const firstTier = (price as any).tiers[0]
            amount = firstTier.unit_amount ?? firstTier.flat_amount ?? null
          }
          if (amount !== null) {
            priceFormatted = new Intl.NumberFormat('de-DE', { style: 'currency', currency: price.currency.toUpperCase() }).format(amount / 100)
          }
        } catch { /* use fallback */ }

        const bookedAt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date())
        await sendModuleBooked({
          to: adminUser.email,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          moduleName: mod.name,
          moduleDescription: mod.description ?? '',
          priceFormatted,
          bookedAt,
        })
      }
    } catch (emailError) {
      console.error('[POST /api/tenant/billing/modules/subscribe] Bestätigungs-E-Mail fehlgeschlagen:', emailError)
    }

    return NextResponse.json({
      success: true,
      subscription_item_id: subscriptionItem.id,
      module_code: mod.code,
    })
  } catch (stripeError) {
    console.error(
      '[POST /api/tenant/billing/modules/subscribe] Stripe-Fehler:',
      stripeError
    )
    return NextResponse.json(
      { error: 'Modul konnte nicht gebucht werden.' },
      { status: 500 }
    )
  }
}
