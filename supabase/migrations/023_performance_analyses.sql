-- PROJ-11 Extension: AI Performance Analyse History
-- Stores tenant-isolated performance analysis runs (single + compare).

CREATE TABLE IF NOT EXISTS performance_analyses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  UUID,
  type        TEXT        NOT NULL CHECK (type IN ('analyze', 'compare')),
  client_label TEXT,
  platform    TEXT,
  analysis    TEXT        NOT NULL,
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE performance_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performance_analyses_select_own_tenant"
  ON performance_analyses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = performance_analyses.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

CREATE POLICY "performance_analyses_deny_insert"
  ON performance_analyses FOR INSERT
  WITH CHECK (false);

CREATE POLICY "performance_analyses_deny_update"
  ON performance_analyses FOR UPDATE
  USING (false) WITH CHECK (false);

CREATE POLICY "performance_analyses_deny_delete"
  ON performance_analyses FOR DELETE
  USING (false);

CREATE INDEX IF NOT EXISTS idx_performance_analyses_tenant_id
  ON performance_analyses (tenant_id);

CREATE INDEX IF NOT EXISTS idx_performance_analyses_tenant_created
  ON performance_analyses (tenant_id, created_at DESC);
