-- ============================================================
-- PROJ-68: Social Media Trend Radar
--
-- Änderungen:
--   • customers.industry_category (TEXT, nullable) – Branche pro Kunde
--   • social_trend_cache – 24h-Cache pro (customer, platform, category, period)
-- ============================================================

-- ── customers.industry_category ─────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS industry_category TEXT
    CHECK (industry_category IS NULL OR char_length(btrim(industry_category)) BETWEEN 2 AND 60);

-- Filter-Index für spätere Gruppierungen (z. B. Industry-Reports)
CREATE INDEX IF NOT EXISTS idx_customers_industry_category
  ON customers (industry_category)
  WHERE industry_category IS NOT NULL;

-- ── social_trend_cache ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_trend_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
  category      TEXT NOT NULL CHECK (char_length(btrim(category)) BETWEEN 2 AND 60),
  period        TEXT NOT NULL CHECK (period IN ('today', 'week', 'month')),
  data          JSONB NOT NULL,
  unavailable   BOOLEAN NOT NULL DEFAULT FALSE,
  unavailable_reason TEXT,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_trend_cache_unique
    UNIQUE (customer_id, platform, category, period)
);

CREATE INDEX IF NOT EXISTS idx_social_trend_cache_lookup
  ON social_trend_cache (customer_id, platform, category, period);

CREATE INDEX IF NOT EXISTS idx_social_trend_cache_tenant
  ON social_trend_cache (tenant_id);

CREATE INDEX IF NOT EXISTS idx_social_trend_cache_cached_at
  ON social_trend_cache (cached_at DESC);

-- ── RLS für social_trend_cache ──────────────────────────────

ALTER TABLE social_trend_cache ENABLE ROW LEVEL SECURITY;

-- SELECT: aktive Tenant-Members
CREATE POLICY "tenant members read social_trend_cache"
  ON social_trend_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = social_trend_cache.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- INSERT/UPDATE/DELETE erfolgen ausschließlich serverseitig über
-- den Service-Role-Key (createAdminClient). Keine Client-Policies nötig —
-- RLS lehnt sie für authenticated-User implizit ab.
