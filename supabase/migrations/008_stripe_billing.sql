-- PROJ-14: Stripe Setup & Basis-Abo
-- Adds Stripe billing columns to tenants and creates webhook idempotency table

-- ---------------------------------------------------------------------------
-- 1. New columns on tenants
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ;

-- Index for looking up a tenant by Stripe customer ID (webhook handler)
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer_id
  ON tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Webhook idempotency table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stripe_webhook_events_event_id_unique UNIQUE (stripe_event_id)
);

-- Enable RLS — only service_role may access this table
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Deny all access for anon / authenticated roles
CREATE POLICY "stripe_webhook_events_deny_select"
  ON stripe_webhook_events FOR SELECT
  USING (false);

CREATE POLICY "stripe_webhook_events_deny_insert"
  ON stripe_webhook_events FOR INSERT
  WITH CHECK (false);

CREATE POLICY "stripe_webhook_events_deny_update"
  ON stripe_webhook_events FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "stripe_webhook_events_deny_delete"
  ON stripe_webhook_events FOR DELETE
  USING (false);

-- Index for fast duplicate-check on incoming webhook events
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id
  ON stripe_webhook_events (stripe_event_id);
