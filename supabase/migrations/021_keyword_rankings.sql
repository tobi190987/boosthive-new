-- PROJ-27: Keyword Rankings Dashboard & History
-- Adds ranking run metadata, snapshot storage, and project tracking fields

ALTER TABLE keyword_projects
  ADD COLUMN IF NOT EXISTS tracking_interval TEXT NOT NULL DEFAULT 'daily'
    CHECK (tracking_interval IN ('daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS last_tracking_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (last_tracking_status IN ('idle', 'queued', 'running', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS last_tracking_error TEXT;

CREATE TABLE IF NOT EXISTS keyword_ranking_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES keyword_projects(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'cron', 'internal')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'success', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  keyword_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE keyword_ranking_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keyword_ranking_runs_select_own"
  ON keyword_ranking_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = keyword_ranking_runs.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "keyword_ranking_runs_deny_insert"
  ON keyword_ranking_runs FOR INSERT WITH CHECK (false);

CREATE POLICY "keyword_ranking_runs_deny_update"
  ON keyword_ranking_runs FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "keyword_ranking_runs_deny_delete"
  ON keyword_ranking_runs FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_keyword_ranking_runs_project_created
  ON keyword_ranking_runs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_ranking_runs_tenant_status
  ON keyword_ranking_runs (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS keyword_ranking_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES keyword_ranking_runs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES keyword_projects(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES keywords(id) ON DELETE SET NULL,
  keyword_label TEXT NOT NULL,
  position NUMERIC(6,2),
  best_url TEXT,
  clicks NUMERIC(12,2),
  impressions NUMERIC(12,2),
  source TEXT NOT NULL DEFAULT 'gsc',
  tracked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE keyword_ranking_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keyword_ranking_snapshots_select_own"
  ON keyword_ranking_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = keyword_ranking_snapshots.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "keyword_ranking_snapshots_deny_insert"
  ON keyword_ranking_snapshots FOR INSERT WITH CHECK (false);

CREATE POLICY "keyword_ranking_snapshots_deny_update"
  ON keyword_ranking_snapshots FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "keyword_ranking_snapshots_deny_delete"
  ON keyword_ranking_snapshots FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_keyword_ranking_snapshots_project_keyword_tracked
  ON keyword_ranking_snapshots (project_id, keyword_id, tracked_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_ranking_snapshots_run_id
  ON keyword_ranking_snapshots (run_id);
CREATE INDEX IF NOT EXISTS idx_keyword_ranking_snapshots_tenant_tracked
  ON keyword_ranking_snapshots (tenant_id, tracked_at DESC);
