-- PROJ-31: Content Brief Generator
-- Migration: content_briefs table

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE content_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Input fields
  keyword TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'de',
  tone TEXT NOT NULL DEFAULT 'informativ' CHECK (tone IN ('informativ', 'werblich', 'neutral')),
  word_count_target INTEGER NOT NULL DEFAULT 1000 CHECK (word_count_target > 0),
  target_url TEXT,

  -- Output
  brief_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'done', 'failed')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their tenant's briefs
CREATE POLICY "Tenant members can read content briefs"
  ON content_briefs FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Tenant members can create briefs for their tenant
CREATE POLICY "Tenant members can create content briefs"
  ON content_briefs FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    AND created_by = auth.uid()
  );

-- Tenant members can update their own briefs (status updates by worker use admin client)
CREATE POLICY "Tenant members can update own content briefs"
  ON content_briefs FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Tenant members can delete briefs in their tenant
CREATE POLICY "Tenant members can delete content briefs"
  ON content_briefs FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX idx_content_briefs_tenant_id ON content_briefs(tenant_id);
CREATE INDEX idx_content_briefs_customer_id ON content_briefs(customer_id);
CREATE INDEX idx_content_briefs_status ON content_briefs(status);
CREATE INDEX idx_content_briefs_created_at ON content_briefs(created_at DESC);
CREATE INDEX idx_content_briefs_tenant_customer ON content_briefs(tenant_id, customer_id);

-- ─── Updated-at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_content_briefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_briefs_updated_at
  BEFORE UPDATE ON content_briefs
  FOR EACH ROW
  EXECUTE FUNCTION update_content_briefs_updated_at();

-- ─── Module registration ────────────────────────────────────────────────────

INSERT INTO modules (code, name, description, stripe_price_id, sort_order, is_active)
VALUES ('content_briefs', 'Content Brief Generator', 'KI-generierte Content-Briefings fuer SEO-optimierte Inhalte', 'price_1TEy4BBqMa5Vx8VNcidWpuHa', 100, true)
ON CONFLICT (code) DO NOTHING;
