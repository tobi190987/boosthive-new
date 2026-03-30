import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { sendOwnerPastDueNotification, sendPaymentFailed } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase-admin'
import type Stripe from 'stripe'

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

/**
 * POST /api/webhooks/stripe
 * Receives and processes Stripe webhook events.
 * Validates the signature and processes events idempotently.
 */
export async function POST(request: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET nicht gesetzt.')
    return NextResponse.json(
      { error: 'Webhook secret nicht konfiguriert.' },
      { status: 500 }
    )
  }

  // Read raw body for signature verification
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Fehlender stripe-signature Header.' },
      { status: 400 }
    )
  }

  // Verify webhook signature
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[Stripe Webhook] Signatur-Validierung fehlgeschlagen:', message)
    return NextResponse.json(
      { error: 'Ungültige Webhook-Signatur.' },
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()

  // Idempotency check: skip already-processed events
  const { data: existingEvent } = await supabaseAdmin
    .from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existingEvent) {
    // Already processed — return 200 so Stripe does not retry
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Process the event
  try {
    switch (event.type) {
      case 'customer.subscription.created':
        // BUG-R2-5 fix: sync DB on subscription creation (e.g. created via Stripe Dashboard)
        await handleSubscriptionUpdated(supabaseAdmin, event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabaseAdmin, event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabaseAdmin, event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(supabaseAdmin, event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(supabaseAdmin, event.data.object as Stripe.Invoice)
        break

      default:
        // Unhandled event type — acknowledge receipt without processing
        break
    }

    // Record event as processed.
    // BUG-R3-2 fix: if two concurrent requests pass the idempotency check at the same time,
    // only one will succeed here. A unique-constraint error (23505) is expected and harmless
    // since both requests already processed the same idempotent handlers.
    const { error: insertError } = await supabaseAdmin
      .from('stripe_webhook_events')
      .insert({ stripe_event_id: event.id })

    if (insertError && insertError.code !== '23505') {
      console.error('[Stripe Webhook] Event-ID konnte nicht gespeichert werden:', insertError)
    }

    // BUG-R3-3 fix: periodically clean up events older than 90 days (1% of requests)
    // to prevent unbounded table growth without needing a dedicated cron job.
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      supabaseAdmin
        .from('stripe_webhook_events')
        .delete()
        .lt('processed_at', cutoff)
        .then(({ error }) => {
          if (error) console.error('[Stripe Webhook] Cleanup fehlgeschlagen:', error)
        })
    }

    return NextResponse.json({ received: true })
  } catch (processingError) {
    console.error('[Stripe Webhook] Verarbeitung fehlgeschlagen:', processingError)
    return NextResponse.json(
      { error: 'Webhook-Verarbeitung fehlgeschlagen.' },
      { status: 500 }
    )
  }
}

/* -------------------------------------------------------------------------- */
/*  Event handlers                                                             */
/* -------------------------------------------------------------------------- */

type SupabaseAdmin = ReturnType<typeof createAdminClient>

// Stripe SDK v21: invoice.subscription exists in the API response but may not
// be present in the TypeScript type definition for all SDK versions.
type InvoiceWithSubscription = Stripe.Invoice & { subscription?: string | null }

async function handleSubscriptionUpdated(
  supabase: SupabaseAdmin,
  subscription: Stripe.Subscription
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  // Determine status
  let subscriptionStatus: string
  if (subscription.cancel_at_period_end) {
    subscriptionStatus = 'canceling'
  } else if (subscription.status === 'active') {
    subscriptionStatus = 'active'
  } else if (subscription.status === 'past_due') {
    subscriptionStatus = 'past_due'
  } else if (
    subscription.status === 'canceled' ||
    subscription.status === 'unpaid'
  ) {
    subscriptionStatus = 'canceled'
  } else {
    subscriptionStatus = subscription.status
  }

  // In Stripe SDK v21, current_period_end lives on subscription items
  const periodEnd = subscription.items.data[0]?.current_period_end ?? null
  const periodEndISO = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null

  // PROJ-16: Respect owner locks — do not auto-reactivate a manually locked tenant
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id, owner_locked_at')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  const isOwnerLocked = existingTenant?.owner_locked_at != null

  const updateData: Record<string, unknown> = {
    subscription_status: subscriptionStatus,
    subscription_period_end: periodEndISO,
    stripe_subscription_id: subscription.id,
  }
  if (subscription.status === 'unpaid' || subscription.status === 'canceled') {
    updateData.status = 'inactive'
  } else if (!isOwnerLocked && (subscriptionStatus === 'active' || subscriptionStatus === 'canceling')) {
    updateData.status = 'active'
  }
  // Do NOT auto-reactivate manually locked tenants.

  const { error } = await supabase
    .from('tenants')
    .update(updateData)
    .eq('stripe_customer_id', customerId)

  if (error) {
    console.error(
      '[Stripe Webhook] subscription.updated DB-Update fehlgeschlagen:',
      error
    )
    throw error
  }

  // PROJ-15: Sync module items after subscription update
  if (existingTenant?.id) {
    await syncModuleItems(supabase, existingTenant.id, subscription)
  }
}

async function handleSubscriptionDeleted(
  supabase: SupabaseAdmin,
  subscription: Stripe.Subscription
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  // Load tenant ID before update (needed for module sync)
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  // BUG-3 fix: deactivate tenant access when subscription is fully deleted
  // BUG-7 fix: use 'canceled' (not 'inactive') to match frontend expectations
  const { error } = await supabase
    .from('tenants')
    .update({
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      subscription_period_end: null,
      status: 'inactive',
    })
    .eq('stripe_customer_id', customerId)

  if (error) {
    console.error(
      '[Stripe Webhook] subscription.deleted DB-Update fehlgeschlagen:',
      error
    )
    throw error
  }

  // PROJ-15: Sync module items — subscription deleted means all modules are gone
  if (tenant?.id) {
    await syncModuleItems(supabase, tenant.id, subscription)
  }
}

async function handleInvoicePaymentFailed(
  supabase: SupabaseAdmin,
  invoice: Stripe.Invoice
) {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null

  if (!customerId) return

  // BUG-1 fix: Stripe SDK v21 — use type assertion to access invoice.subscription
  const inv = invoice as InvoiceWithSubscription
  if (!inv.subscription) return

  const { error } = await supabase
    .from('tenants')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_customer_id', customerId)

  if (error) {
    console.error(
      '[Stripe Webhook] invoice.payment_failed DB-Update fehlgeschlagen:',
      error
    )
    throw error
  }

  // BUG-2 fix: send payment-failed email to tenant admin
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug, subscription_status')
      .eq('stripe_customer_id', customerId)
      .single()

    if (tenant) {
      const { data: adminMember } = await supabase
        .from('tenant_members')
        .select('user_id')
        .eq('tenant_id', tenant.id)
        .eq('role', 'admin')
        .eq('status', 'active')
        .limit(1)
        .single()

      if (adminMember) {
        const { data: userData } = await supabase.auth.admin.getUserById(adminMember.user_id)
        if (userData.user?.email) {
          await sendPaymentFailed({
            to: userData.user.email,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
          })
        }
      }

      // PROJ-16: Notify all platform owners about past_due tenant
      await sendOwnerPastDueNotification(supabase, tenant.name, tenant.slug, tenant.id)
    }
  } catch (emailError) {
    // Non-fatal: log but don't fail the webhook
    console.error('[Stripe Webhook] Payment-failed E-Mail konnte nicht gesendet werden:', emailError)
  }
}

async function handleInvoicePaymentSucceeded(
  supabase: SupabaseAdmin,
  invoice: Stripe.Invoice
) {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null

  if (!customerId) return

  // BUG-1 fix: Stripe SDK v21 — use type assertion to access invoice.subscription
  const inv = invoice as InvoiceWithSubscription
  if (!inv.subscription) return

  // PROJ-16: Respect owner locks — do not auto-reactivate a manually locked tenant
  const { data: lockedTenant } = await supabase
    .from('tenants')
    .select('id, owner_locked_at')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  const isOwnerLocked = lockedTenant?.owner_locked_at != null

  const updatePayload: Record<string, unknown> = { subscription_status: 'active' }
  if (!isOwnerLocked) {
    updatePayload.status = 'active'
  }

  const { error } = await supabase
    .from('tenants')
    .update(updatePayload)
    .eq('stripe_customer_id', customerId)

  if (error) {
    console.error(
      '[Stripe Webhook] invoice.payment_succeeded DB-Update fehlgeschlagen:',
      error
    )
    throw error
  }
}

/* -------------------------------------------------------------------------- */
/*  PROJ-15: Module subscription item sync                                     */
/* -------------------------------------------------------------------------- */

const BASIS_PLAN_PRICE_ID = process.env.STRIPE_BASIS_PLAN_PRICE_ID

/**
 * Synchronizes tenant_modules based on the current Stripe subscription items.
 * Stripe is the source of truth -- this function reconciles the DB accordingly.
 */
async function syncModuleItems(
  supabase: SupabaseAdmin,
  tenantId: string,
  subscription: Stripe.Subscription
) {
  try {
    // Load all module definitions
    const { data: allModules, error: modError } = await supabase
      .from('modules')
      .select('id, code, stripe_price_id')

    if (modError || !allModules || allModules.length === 0) return

    // Build a map from stripe_price_id to module IDs
    const priceToModules = new Map<string, typeof allModules>()
    for (const mod of allModules) {
      const existing = priceToModules.get(mod.stripe_price_id) ?? []
      existing.push(mod)
      priceToModules.set(mod.stripe_price_id, existing)
    }

    // Get current subscription items (excluding basis plan)
    const moduleItems = subscription.items.data.filter(
      (item) => item.price.id !== BASIS_PLAN_PRICE_ID
    )

    // Build a set of module_ids that are currently active in Stripe
    const activeModuleIds = new Set<string>()
    const itemUpdates: { moduleId: string; itemId: string; periodEnd: string | null }[] = []

    for (const item of moduleItems) {
      // Try to resolve module by metadata first (most reliable)
      const metadataModuleId = item.metadata?.module_id
      if (metadataModuleId) {
        activeModuleIds.add(metadataModuleId)
        const periodEnd = item.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null
        itemUpdates.push({
          moduleId: metadataModuleId,
          itemId: item.id,
          periodEnd,
        })
        continue
      }

      // Fallback: resolve by price_id (only if unambiguous)
      const matchingModules = priceToModules.get(item.price.id)
      if (matchingModules && matchingModules.length === 1) {
        const mod = matchingModules[0]
        activeModuleIds.add(mod.id)
        const periodEnd = item.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null
        itemUpdates.push({
          moduleId: mod.id,
          itemId: item.id,
          periodEnd,
        })
      }
    }

    // Upsert active modules
    for (const update of itemUpdates) {
      await supabase
        .from('tenant_modules')
        .upsert(
          {
            tenant_id: tenantId,
            module_id: update.moduleId,
            stripe_subscription_item_id: update.itemId,
            status: 'active',
            cancel_at_period_end: false,
            current_period_end: update.periodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,module_id' }
        )
    }

    // Mark modules no longer present in Stripe as canceled.
    const { data: currentBookings } = await supabase
      .from('tenant_modules')
      .select('id, module_id, status')
      .eq('tenant_id', tenantId)
      .in('status', ['active', 'canceling'])

    if (currentBookings) {
      const toCancel = currentBookings.filter(
        (b) => !activeModuleIds.has(b.module_id)
      )

      for (const booking of toCancel) {
        await supabase
          .from('tenant_modules')
          .update({
            status: 'canceled',
            stripe_subscription_item_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id)
      }
    }
  } catch (syncError) {
    // Non-fatal: log but don't fail the webhook
    console.error('[Stripe Webhook] Module-Sync fehlgeschlagen:', syncError)
  }
}
