-- PROJ-30: SEO Competitor Analyse — seo_comparisons table

CREATE TABLE IF NOT EXISTS seo_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  own_url TEXT NOT NULL,
  competitor_urls TEXT[] NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_comparisons_tenant_id_idx ON seo_comparisons(tenant_id);
CREATE INDEX IF NOT EXISTS seo_comparisons_customer_id_idx ON seo_comparisons(customer_id);

ALTER TABLE seo_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view own seo comparisons" ON seo_comparisons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = seo_comparisons.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "Deny direct insert seo comparisons" ON seo_comparisons
  FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny direct update seo comparisons" ON seo_comparisons
  FOR UPDATE USING (false);

CREATE POLICY "Deny direct delete seo comparisons" ON seo_comparisons
  FOR DELETE USING (false);
