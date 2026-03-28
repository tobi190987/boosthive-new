import Stripe from 'stripe'

/**
 * Server-side Stripe client (lazy initialization).
 * NEVER import this file in client components — the secret key must stay on the server.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY          — Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET      — Webhook endpoint signing secret
 *   STRIPE_BASIS_PLAN_PRICE_ID — Price ID for the Basis-Plan
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — (client-side, used in StripeCardForm)
 */

let _stripe: Stripe | null = null

function getStripeInstance(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY must be set as an environment variable.')
    }
    _stripe = new Stripe(key, { typescript: true })
  }
  return _stripe
}

// Proxy so all existing `stripe.xxx` call sites work unchanged,
// but the client is only created when first actually used (not at import time).
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop: string | symbol) {
    return (getStripeInstance() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

/** Subscription status values stored in tenants.subscription_status */
export type SubscriptionStatus =
  | 'inactive'
  | 'active'
  | 'past_due'
  | 'canceling'
  | 'canceled'
