-- PROJ-33: Ad Text Generator
-- Migration: ad_generations table

CREATE TABLE ad_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  briefing JSONB NOT NULL,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ad_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read ad generations"
  ON ad_generations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Tenant members can create ad generations"
  ON ad_generations FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Tenant members can update ad generations"
  ON ad_generations FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Tenant members can delete ad generations"
  ON ad_generations FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE INDEX idx_ad_generations_tenant_id ON ad_generations(tenant_id);
CREATE INDEX idx_ad_generations_customer_id ON ad_generations(customer_id);
CREATE INDEX idx_ad_generations_status ON ad_generations(status);
CREATE INDEX idx_ad_generations_created_at ON ad_generations(created_at DESC);
CREATE INDEX idx_ad_generations_tenant_customer ON ad_generations(tenant_id, customer_id);

CREATE OR REPLACE FUNCTION update_ad_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ad_generations_updated_at
  BEFORE UPDATE ON ad_generations
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_generations_updated_at();

INSERT INTO modules (code, name, description, stripe_price_id, sort_order, is_active)
VALUES ('ad_generator', 'Ad Text Generator', 'KI-generierte Anzeigentexte fuer Social und Paid Ads', 'price_1TEy4BBqMa5Vx8VNcidWpuHa', 110, true)
ON CONFLICT (code) DO NOTHING;
