import Stripe from 'stripe'

/**
 * Server-side Stripe client.
 * NEVER import this file in client components — the secret key must stay on the server.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY          — Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET      — Webhook endpoint signing secret
 *   STRIPE_BASIS_PLAN_PRICE_ID — Price ID for the Basis-Plan
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — (client-side, used in StripeCardForm)
 */

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY must be set as an environment variable.')
}

export const stripe = new Stripe(stripeSecretKey, {
  typescript: true,
})

/** Subscription status values stored in tenants.subscription_status */
export type SubscriptionStatus =
  | 'inactive'
  | 'active'
  | 'past_due'
  | 'canceling'
  | 'canceled'
