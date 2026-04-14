-- ============================================================
-- PROJ-67: Brand Mention Monitoring & Sentiment Analyse
--
-- Ergänzungen:
--   • brand_keywords.sentiment_alert_threshold  – Integer 0-100 (nullable)
--   • brand_mention_cache                        – 24h-Cache für Exa.ai-Mentions
--   • notifications.type-CHECK                   – neuer Typ 'sentiment_alert'
--                                                (inkl. Bestandstypen aus
--                                                 PROJ-14 / PROJ-57 / PROJ-34)
-- ============================================================

-- ── brand_keywords: Sentiment-Alert-Schwellwert ─────────────

ALTER TABLE brand_keywords
  ADD COLUMN IF NOT EXISTS sentiment_alert_threshold INTEGER
  CHECK (sentiment_alert_threshold IS NULL
         OR (sentiment_alert_threshold BETWEEN 0 AND 100));

-- ── brand_mention_cache ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_mention_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  keyword           TEXT NOT NULL,
  period            TEXT NOT NULL CHECK (period IN ('7d', '30d', '90d')),
  mentions          JSONB NOT NULL,
  sentiment_score   INTEGER CHECK (sentiment_score IS NULL
                                   OR (sentiment_score BETWEEN 0 AND 100)),
  positive_count    INTEGER NOT NULL DEFAULT 0,
  neutral_count     INTEGER NOT NULL DEFAULT 0,
  negative_count    INTEGER NOT NULL DEFAULT 0,
  total_found       INTEGER NOT NULL DEFAULT 0,
  truncated         BOOLEAN NOT NULL DEFAULT FALSE,
  cached_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brand_mention_cache_unique
    UNIQUE (customer_id, keyword, period)
);

CREATE INDEX IF NOT EXISTS idx_brand_mention_cache_lookup
  ON brand_mention_cache (customer_id, keyword, period);

CREATE INDEX IF NOT EXISTS idx_brand_mention_cache_tenant
  ON brand_mention_cache (tenant_id);

CREATE INDEX IF NOT EXISTS idx_brand_mention_cache_cached_at
  ON brand_mention_cache (cached_at DESC);

-- ── RLS für brand_mention_cache ─────────────────────────────

ALTER TABLE brand_mention_cache ENABLE ROW LEVEL SECURITY;

-- SELECT: aktive Tenant-Members
CREATE POLICY "tenant members read brand_mention_cache"
  ON brand_mention_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = brand_mention_cache.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- INSERT / UPDATE / DELETE ausschließlich über Service-Role (Server).
-- Keine authenticated-Policies → RLS lehnt Client-Schreibzugriffe ab.

-- ── notifications.type-CHECK erweitern ──────────────────────
-- BUG-6 Fix: Constraint-Name kann auto-generiert sein (notifications_type_check)
-- oder manuell gepatcht worden sein. DO-Block findet + droppt ALLE CHECK-
-- Constraints auf der type-Spalte, bevor der neue benannte Constraint gesetzt wird.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM   information_schema.table_constraints tc
    JOIN   information_schema.check_constraints cc
           ON cc.constraint_name = tc.constraint_name
    WHERE  tc.table_name        = 'notifications'
      AND  tc.constraint_type   = 'CHECK'
      AND  cc.check_clause      ILIKE '%type%'
  LOOP
    EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS '
            || quote_ident(r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'approval_approved',
    'approval_changes_requested',
    'budget_alert',
    'sentiment_alert'
  ));
