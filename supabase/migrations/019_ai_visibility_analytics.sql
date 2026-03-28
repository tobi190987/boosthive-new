-- PROJ-23: AI Visibility Analytics & GEO
-- Adds cached analytics tables and processing state on visibility_analyses.

ALTER TABLE visibility_analyses
  ADD COLUMN IF NOT EXISTS analytics_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (analytics_status IN ('pending', 'running', 'done', 'failed', 'partial')),
  ADD COLUMN IF NOT EXISTS analytics_error_message TEXT,
  ADD COLUMN IF NOT EXISTS analytics_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analytics_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_visibility_analyses_analytics_status
  ON visibility_analyses (tenant_id, analytics_status);

-- ---------------------------------------------------------------------------
-- 1. visibility_scores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visibility_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES visibility_analyses(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES visibility_projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  model_name TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('brand', 'competitor')),
  subject_name TEXT NOT NULL,
  mention_count INT NOT NULL DEFAULT 0,
  response_count INT NOT NULL DEFAULT 0,
  share_of_model NUMERIC(6,2) NOT NULL DEFAULT 0,
  sentiment_positive NUMERIC(6,2) NOT NULL DEFAULT 0,
  sentiment_neutral NUMERIC(6,2) NOT NULL DEFAULT 0,
  sentiment_negative NUMERIC(6,2) NOT NULL DEFAULT 0,
  sentiment_unknown NUMERIC(6,2) NOT NULL DEFAULT 0,
  geo_score NUMERIC(6,2),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visibility_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visibility_scores_select_own_tenant"
  ON visibility_scores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = visibility_scores.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "visibility_scores_deny_insert"
  ON visibility_scores FOR INSERT
  WITH CHECK (false);

CREATE POLICY "visibility_scores_deny_update"
  ON visibility_scores FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "visibility_scores_deny_delete"
  ON visibility_scores FOR DELETE
  USING (false);

CREATE INDEX IF NOT EXISTS idx_visibility_scores_analysis
  ON visibility_scores (analysis_id, model_name, keyword);

CREATE INDEX IF NOT EXISTS idx_visibility_scores_project
  ON visibility_scores (project_id, computed_at DESC);

-- ---------------------------------------------------------------------------
-- 2. visibility_sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visibility_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES visibility_analyses(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES visibility_projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  model_name TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  source_url TEXT,
  mentioned_subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  mention_count INT NOT NULL DEFAULT 0,
  is_source_gap BOOLEAN NOT NULL DEFAULT false,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visibility_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visibility_sources_select_own_tenant"
  ON visibility_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = visibility_sources.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "visibility_sources_deny_insert"
  ON visibility_sources FOR INSERT
  WITH CHECK (false);

CREATE POLICY "visibility_sources_deny_update"
  ON visibility_sources FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "visibility_sources_deny_delete"
  ON visibility_sources FOR DELETE
  USING (false);

CREATE INDEX IF NOT EXISTS idx_visibility_sources_analysis
  ON visibility_sources (analysis_id, model_name, keyword);

CREATE INDEX IF NOT EXISTS idx_visibility_sources_project
  ON visibility_sources (project_id, mention_count DESC);

-- ---------------------------------------------------------------------------
-- 3. visibility_recommendations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visibility_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES visibility_analyses(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES visibility_projects(id) ON DELETE CASCADE,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT NOT NULL,
  recommendation_type TEXT NOT NULL,
  related_keyword TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  sort_order INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visibility_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visibility_recommendations_select_own_tenant"
  ON visibility_recommendations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = visibility_recommendations.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "visibility_recommendations_deny_insert"
  ON visibility_recommendations FOR INSERT
  WITH CHECK (false);

CREATE POLICY "visibility_recommendations_deny_update"
  ON visibility_recommendations FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "visibility_recommendations_deny_delete"
  ON visibility_recommendations FOR DELETE
  USING (false);

CREATE INDEX IF NOT EXISTS idx_visibility_recommendations_analysis
  ON visibility_recommendations (analysis_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_visibility_recommendations_project
  ON visibility_recommendations (project_id, priority, computed_at DESC);
