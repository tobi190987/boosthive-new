-- PROJ-25: Keyword Project Management
-- Creates keyword_projects, keywords, competitor_domains tables with RLS

-- ---------------------------------------------------------------------------
-- 1. keyword_projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS keyword_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  language_code TEXT NOT NULL DEFAULT 'de',
  country_code TEXT NOT NULL DEFAULT 'DE',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_tracking_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE keyword_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keyword_projects_select_own"
  ON keyword_projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = keyword_projects.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "keyword_projects_deny_insert"
  ON keyword_projects FOR INSERT WITH CHECK (false);

CREATE POLICY "keyword_projects_deny_update"
  ON keyword_projects FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "keyword_projects_deny_delete"
  ON keyword_projects FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_keyword_projects_tenant_id ON keyword_projects (tenant_id);
CREATE INDEX IF NOT EXISTS idx_keyword_projects_tenant_status ON keyword_projects (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 2. keywords
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES keyword_projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT keywords_project_keyword_unique UNIQUE (project_id, keyword)
);

ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keywords_select_own"
  ON keywords FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = keywords.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "keywords_deny_insert"
  ON keywords FOR INSERT WITH CHECK (false);

CREATE POLICY "keywords_deny_update"
  ON keywords FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "keywords_deny_delete"
  ON keywords FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_keywords_project_id ON keywords (project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_tenant_id ON keywords (tenant_id);

-- ---------------------------------------------------------------------------
-- 3. competitor_domains
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES keyword_projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT competitor_domains_project_domain_unique UNIQUE (project_id, domain)
);

ALTER TABLE competitor_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_domains_select_own"
  ON competitor_domains FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = competitor_domains.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "competitor_domains_deny_insert"
  ON competitor_domains FOR INSERT WITH CHECK (false);

CREATE POLICY "competitor_domains_deny_update"
  ON competitor_domains FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "competitor_domains_deny_delete"
  ON competitor_domains FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_competitor_domains_project_id ON competitor_domains (project_id);
CREATE INDEX IF NOT EXISTS idx_competitor_domains_tenant_id ON competitor_domains (tenant_id);

-- ---------------------------------------------------------------------------
-- 4. Add keyword_tracking module to catalog
-- ---------------------------------------------------------------------------
INSERT INTO modules (code, name, description, stripe_price_id, sort_order, is_active)
VALUES (
  'keyword_tracking',
  'Keyword Rankings',
  'Tracke Keyword-Rankings fuer deine Kunden, ueberwache Wettbewerber und analysiere historische Ranking-Entwicklungen.',
  'price_1TEy4BBqMa5Vx8VNcidWpuHa',
  40,
  true
)
ON CONFLICT (code) DO NOTHING;
