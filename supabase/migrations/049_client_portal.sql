-- Migration 049: PROJ-62 Client-Portal (Kunden-Login, Read-Only)
-- Creates portal user management, branding settings, and visibility config.

-- ─── client_portal_users ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_portal_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  name            TEXT,
  auth_user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_users_tenant
  ON client_portal_users(tenant_id);

CREATE INDEX IF NOT EXISTS idx_portal_users_customer
  ON client_portal_users(customer_id);

CREATE INDEX IF NOT EXISTS idx_portal_users_email_tenant
  ON client_portal_users(email, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_auth_user
  ON client_portal_users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ─── client_portal_settings ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_portal_settings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portal_logo_url  TEXT,
  primary_color    TEXT        NOT NULL DEFAULT '#3b82f6',
  agency_name      TEXT,
  custom_domain    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_settings_tenant_unique UNIQUE (tenant_id)
);

-- ─── client_portal_visibility ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_portal_visibility (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  show_ga4      BOOLEAN     NOT NULL DEFAULT true,
  show_ads      BOOLEAN     NOT NULL DEFAULT true,
  show_seo      BOOLEAN     NOT NULL DEFAULT true,
  show_reports  BOOLEAN     NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_visibility_customer_unique UNIQUE (customer_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_visibility_tenant
  ON client_portal_visibility(tenant_id);

-- ─── exports: add portal sharing flag ───────────────────────────────────────

ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS is_shared_with_portal BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_exports_portal_shared
  ON exports (customer_id, is_shared_with_portal)
  WHERE is_shared_with_portal = true;

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_visibility ENABLE ROW LEVEL SECURITY;

-- Tenant members (admin + member) can manage portal users for their tenant
CREATE POLICY "tenant_members_can_manage_portal_users"
  ON client_portal_users
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Tenant members can manage portal settings for their tenant
CREATE POLICY "tenant_members_can_manage_portal_settings"
  ON client_portal_settings
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Tenant members can manage visibility for their tenant's customers
CREATE POLICY "tenant_members_can_manage_portal_visibility"
  ON client_portal_visibility
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
