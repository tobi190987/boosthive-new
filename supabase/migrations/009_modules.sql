-- PROJ-15: Modul-Buchung & Verwaltung
-- Creates the modules catalog and tenant_modules booking table

-- ---------------------------------------------------------------------------
-- 1. Module catalog table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stripe_price_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT modules_code_unique UNIQUE (code)
);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

-- Modules catalog is publicly readable (needed for billing UI and dashboard gating)
CREATE POLICY "modules_select_authenticated"
  ON modules FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role can INSERT/UPDATE/DELETE (owner manages via admin client)
CREATE POLICY "modules_deny_insert"
  ON modules FOR INSERT
  WITH CHECK (false);

CREATE POLICY "modules_deny_update"
  ON modules FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "modules_deny_delete"
  ON modules FOR DELETE
  USING (false);

-- Index for sort order in catalog listing
CREATE INDEX IF NOT EXISTS idx_modules_sort_order ON modules (sort_order);
CREATE INDEX IF NOT EXISTS idx_modules_is_active ON modules (is_active) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 2. Tenant module bookings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  stripe_subscription_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'canceling', 'canceled')),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenant_modules_tenant_module_unique UNIQUE (tenant_id, module_id)
);

ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own tenant's modules (for feature-gating)
CREATE POLICY "tenant_modules_select_own"
  ON tenant_modules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = tenant_modules.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

-- Only service_role can INSERT/UPDATE/DELETE (API routes use admin client)
CREATE POLICY "tenant_modules_deny_insert"
  ON tenant_modules FOR INSERT
  WITH CHECK (false);

CREATE POLICY "tenant_modules_deny_update"
  ON tenant_modules FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "tenant_modules_deny_delete"
  ON tenant_modules FOR DELETE
  USING (false);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_id ON tenant_modules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_status ON tenant_modules (status);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_status
  ON tenant_modules (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 3. Seed initial modules (all share the same price ID per your config)
-- ---------------------------------------------------------------------------
INSERT INTO modules (code, name, description, stripe_price_id, sort_order, is_active)
VALUES
  ('seo_analyse', 'SEO Analyse', 'Umfassende SEO-Analyse deiner Webseite mit technischen und inhaltlichen Empfehlungen.', 'price_1TEy4BBqMa5Vx8VNcidWpuHa', 10, true),
  ('ai_performance', 'AI Performance Analyse', 'KI-gestuetzte Analyse deiner Marketing-Performance mit automatischen Optimierungsvorschlaegen.', 'price_1TEy4BBqMa5Vx8VNcidWpuHa', 20, true),
  ('ai_visibility', 'AI Visibility Tool', 'Ueberwache und optimiere deine Sichtbarkeit in KI-Suchsystemen wie ChatGPT und Perplexity.', 'price_1TEy4BBqMa5Vx8VNcidWpuHa', 30, true)
ON CONFLICT (code) DO NOTHING;
