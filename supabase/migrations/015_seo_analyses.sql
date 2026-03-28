-- PROJ-10: SEO Analyse
-- Stores tenant-isolated SEO analysis runs and their results.

CREATE TABLE IF NOT EXISTS seo_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'done', 'error')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_msg TEXT,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_total INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE seo_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seo_analyses_select_own_tenant"
  ON seo_analyses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = seo_analyses.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "seo_analyses_deny_insert"
  ON seo_analyses FOR INSERT
  WITH CHECK (false);

CREATE POLICY "seo_analyses_deny_update"
  ON seo_analyses FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "seo_analyses_deny_delete"
  ON seo_analyses FOR DELETE
  USING (false);

CREATE INDEX IF NOT EXISTS idx_seo_analyses_tenant_id
  ON seo_analyses (tenant_id);

CREATE INDEX IF NOT EXISTS idx_seo_analyses_tenant_created_at
  ON seo_analyses (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seo_analyses_tenant_status
  ON seo_analyses (tenant_id, status);
