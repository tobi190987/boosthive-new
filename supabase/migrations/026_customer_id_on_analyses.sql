-- PROJ-29 follow-up: Add customer_id to analysis tables for customer-level filtering

ALTER TABLE seo_analyses
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE performance_analyses
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE visibility_projects
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seo_analyses_customer_id ON seo_analyses(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_performance_analyses_customer_id ON performance_analyses(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visibility_projects_customer_id ON visibility_projects(customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE keyword_projects
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_keyword_projects_customer_id ON keyword_projects(customer_id) WHERE customer_id IS NOT NULL;
