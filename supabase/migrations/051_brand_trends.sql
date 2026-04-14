-- ============================================================
-- PROJ-66: Google Trends Integration (Brand Intelligence – Phase 1)
--
-- Tabellen:
--   • brand_keywords      – Brand-Keywords pro Customer (max. 5 / customer)
--   • brand_trend_cache   – 24h-Cache für SerpAPI-Trend-Daten
-- ============================================================

-- ── brand_keywords ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_keywords (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  keyword       TEXT NOT NULL CHECK (char_length(btrim(keyword)) BETWEEN 2 AND 60),
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brand_keywords_unique_per_customer
    UNIQUE (customer_id, keyword)
);

-- Nur ein primäres Keyword pro Customer (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_keywords_one_primary
  ON brand_keywords (customer_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_brand_keywords_customer
  ON brand_keywords (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brand_keywords_tenant
  ON brand_keywords (tenant_id);

-- ── RLS für brand_keywords ──────────────────────────────────

ALTER TABLE brand_keywords ENABLE ROW LEVEL SECURITY;

-- SELECT: alle aktiven Tenant-Members
CREATE POLICY "tenant members read brand_keywords"
  ON brand_keywords FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = brand_keywords.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- INSERT: alle aktiven Tenant-Members (UI-seitig durch max. 5 begrenzt)
CREATE POLICY "tenant members insert brand_keywords"
  ON brand_keywords FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = brand_keywords.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- UPDATE: alle aktiven Tenant-Members (für Primär-Toggle)
CREATE POLICY "tenant members update brand_keywords"
  ON brand_keywords FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = brand_keywords.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = brand_keywords.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- DELETE: alle aktiven Tenant-Members
CREATE POLICY "tenant members delete brand_keywords"
  ON brand_keywords FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = brand_keywords.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION update_brand_keywords_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brand_keywords_updated_at ON brand_keywords;
CREATE TRIGGER trg_brand_keywords_updated_at
  BEFORE UPDATE ON brand_keywords
  FOR EACH ROW EXECUTE FUNCTION update_brand_keywords_updated_at();

-- ── brand_trend_cache ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_trend_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  keyword       TEXT NOT NULL,
  period        TEXT NOT NULL CHECK (period IN ('7d', '30d', '90d')),
  data          JSONB NOT NULL,
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brand_trend_cache_unique
    UNIQUE (customer_id, keyword, period)
);

CREATE INDEX IF NOT EXISTS idx_brand_trend_cache_lookup
  ON brand_trend_cache (customer_id, keyword, period);

CREATE INDEX IF NOT EXISTS idx_brand_trend_cache_tenant
  ON brand_trend_cache (tenant_id);

CREATE INDEX IF NOT EXISTS idx_brand_trend_cache_cached_at
  ON brand_trend_cache (cached_at DESC);

-- ── RLS für brand_trend_cache ───────────────────────────────

ALTER TABLE brand_trend_cache ENABLE ROW LEVEL SECURITY;

-- SELECT: aktive Tenant-Members
CREATE POLICY "tenant members read brand_trend_cache"
  ON brand_trend_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = brand_trend_cache.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- INSERT/UPDATE/DELETE des Caches erfolgt ausschließlich serverseitig
-- über den Service-Role-Key (createAdminClient). Keine Client-Policies nötig
-- für Mutationen — RLS lehnt sie für authenticated-User implizit ab.
