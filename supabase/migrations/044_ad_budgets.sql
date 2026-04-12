-- ============================================================
-- PROJ-57: Budget & Ad Spend Tracking
-- ============================================================

-- ── ad_budgets: planned monthly budgets per customer+platform ──

CREATE TABLE IF NOT EXISTS ad_budgets (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id            UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  platform               TEXT NOT NULL CHECK (platform IN ('google_ads', 'meta_ads', 'tiktok_ads')),
  label                  TEXT,
  budget_month           DATE NOT NULL,   -- always first day of the month: 2026-04-01
  planned_amount         NUMERIC(12, 2) NOT NULL CHECK (planned_amount >= 0),
  currency               TEXT NOT NULL DEFAULT 'EUR',
  alert_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_percent BETWEEN 0 AND 200),
  -- alert deduplication timestamps (NULL = not yet sent)
  alert_80_sent_at       TIMESTAMPTZ,
  alert_100_sent_at      TIMESTAMPTZ,
  alert_150_sent_at      TIMESTAMPTZ,
  -- cached metrics from last Ads API sync
  cached_cpc             NUMERIC(12, 4),
  cached_cpm             NUMERIC(12, 4),
  cached_roas            NUMERIC(12, 4),
  last_synced_at         TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, customer_id, platform, label, budget_month)
);

CREATE INDEX IF NOT EXISTS idx_ad_budgets_tenant_month
  ON ad_budgets (tenant_id, budget_month);

CREATE INDEX IF NOT EXISTS idx_ad_budgets_customer
  ON ad_budgets (customer_id);

-- ── ad_spend_entries: daily spend data (manual or via API) ──

CREATE TABLE IF NOT EXISTS ad_spend_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   UUID NOT NULL REFERENCES ad_budgets(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  spend_date  DATE NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  source      TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'api_google', 'api_meta', 'api_tiktok')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (budget_id, spend_date)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_budget_date
  ON ad_spend_entries (budget_id, spend_date);

CREATE INDEX IF NOT EXISTS idx_ad_spend_tenant
  ON ad_spend_entries (tenant_id);

-- ── RLS ──

ALTER TABLE ad_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_entries ENABLE ROW LEVEL SECURITY;

-- Tenant members can read
CREATE POLICY "tenant members read ad_budgets"
  ON ad_budgets FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

-- Only admins can insert/update/delete
CREATE POLICY "tenant admins write ad_budgets"
  ON ad_budgets FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND deleted_at IS NULL
    )
  );

-- Tenant members can read spend entries
CREATE POLICY "tenant members read ad_spend_entries"
  ON ad_spend_entries FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

-- Only admins can write spend entries
CREATE POLICY "tenant admins write ad_spend_entries"
  ON ad_spend_entries FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND deleted_at IS NULL
    )
  );

-- ── updated_at trigger ──

CREATE OR REPLACE FUNCTION update_ad_budgets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ad_budgets_updated_at
  BEFORE UPDATE ON ad_budgets
  FOR EACH ROW EXECUTE FUNCTION update_ad_budgets_updated_at();
