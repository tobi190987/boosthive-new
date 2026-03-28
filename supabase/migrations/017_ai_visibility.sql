-- PROJ-12: AI Visibility Query Engine
-- Stores tenant-isolated visibility analysis projects, analysis runs, and raw AI responses.

-- ---------------------------------------------------------------------------
-- 1. visibility_projects — Ein Analyse-Projekt pro Kunde/Brand
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visibility_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  website_url TEXT,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords TEXT[] NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visibility_projects ENABLE ROW LEVEL SECURITY;

-- RLS: Tenant members can SELECT their own projects
CREATE POLICY "visibility_projects_select_own_tenant"
  ON visibility_projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = visibility_projects.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE denied for authenticated users (service_role only via admin client)
CREATE POLICY "visibility_projects_deny_insert"
  ON visibility_projects FOR INSERT
  WITH CHECK (false);

CREATE POLICY "visibility_projects_deny_update"
  ON visibility_projects FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "visibility_projects_deny_delete"
  ON visibility_projects FOR DELETE
  USING (false);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visibility_projects_tenant_id
  ON visibility_projects (tenant_id);

CREATE INDEX IF NOT EXISTS idx_visibility_projects_tenant_created_at
  ON visibility_projects (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. visibility_analyses — Eine Analyse-Ausfuehrung pro Projektlauf
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visibility_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES visibility_projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  models TEXT[] NOT NULL,
  iterations INT NOT NULL DEFAULT 5
    CHECK (iterations BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'running', 'done', 'failed', 'cancelled')),
  progress_done INT NOT NULL DEFAULT 0,
  progress_total INT NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(10,4),
  actual_cost NUMERIC(10,4),
  error_message TEXT,
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visibility_analyses ENABLE ROW LEVEL SECURITY;

-- RLS: Tenant members can SELECT their own analyses
CREATE POLICY "visibility_analyses_select_own_tenant"
  ON visibility_analyses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = visibility_analyses.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "visibility_analyses_deny_insert"
  ON visibility_analyses FOR INSERT
  WITH CHECK (false);

CREATE POLICY "visibility_analyses_deny_update"
  ON visibility_analyses FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "visibility_analyses_deny_delete"
  ON visibility_analyses FOR DELETE
  USING (false);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visibility_analyses_project_id
  ON visibility_analyses (project_id);

CREATE INDEX IF NOT EXISTS idx_visibility_analyses_tenant_id
  ON visibility_analyses (tenant_id);

CREATE INDEX IF NOT EXISTS idx_visibility_analyses_status
  ON visibility_analyses (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_visibility_analyses_tenant_project
  ON visibility_analyses (tenant_id, project_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. visibility_raw_results — Eine einzelne KI-Antwort
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visibility_raw_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES visibility_analyses(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  brand_mentioned BOOLEAN NOT NULL DEFAULT false,
  brand_position INT,
  competitor_mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  tokens_used INT,
  cost NUMERIC(10,6),
  error_flag BOOLEAN NOT NULL DEFAULT false,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visibility_raw_results ENABLE ROW LEVEL SECURITY;

-- RLS: Tenant members can SELECT their own results
CREATE POLICY "visibility_raw_results_select_own_tenant"
  ON visibility_raw_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = visibility_raw_results.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "visibility_raw_results_deny_insert"
  ON visibility_raw_results FOR INSERT
  WITH CHECK (false);

CREATE POLICY "visibility_raw_results_deny_update"
  ON visibility_raw_results FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "visibility_raw_results_deny_delete"
  ON visibility_raw_results FOR DELETE
  USING (false);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visibility_raw_results_analysis_id
  ON visibility_raw_results (analysis_id);

CREATE INDEX IF NOT EXISTS idx_visibility_raw_results_tenant_id
  ON visibility_raw_results (tenant_id);

CREATE INDEX IF NOT EXISTS idx_visibility_raw_results_analysis_model
  ON visibility_raw_results (analysis_id, model_name);

-- ---------------------------------------------------------------------------
-- 4. Module catalog entry (idempotent — already seeded in 009, but ensure code exists)
-- ---------------------------------------------------------------------------
INSERT INTO modules (code, name, description, stripe_price_id, sort_order, is_active)
VALUES (
  'ai_visibility',
  'AI Visibility Tool',
  'Überwache und optimiere deine Sichtbarkeit in KI-Suchsystemen wie ChatGPT und Perplexity.',
  'price_1TEy4BBqMa5Vx8VNcidWpuHa',
  30,
  true
)
ON CONFLICT (code) DO NOTHING;
