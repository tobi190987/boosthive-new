-- PROJ-26: Google Search Console OAuth Integration
-- Creates gsc_connections table for storing encrypted OAuth tokens per keyword project

-- ---------------------------------------------------------------------------
-- 1. gsc_connections (1:1 with keyword_projects)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gsc_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES keyword_projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  selected_property TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gsc_connections ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT only for tenant members (same pattern as keyword_projects)
CREATE POLICY "gsc_connections_select_own"
  ON gsc_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = gsc_connections.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

-- All mutations go through admin client (service role) - deny direct access
CREATE POLICY "gsc_connections_deny_insert"
  ON gsc_connections FOR INSERT WITH CHECK (false);

CREATE POLICY "gsc_connections_deny_update"
  ON gsc_connections FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "gsc_connections_deny_delete"
  ON gsc_connections FOR DELETE USING (false);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_gsc_connections_project_id ON gsc_connections (project_id);
CREATE INDEX IF NOT EXISTS idx_gsc_connections_tenant_id ON gsc_connections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gsc_connections_status ON gsc_connections (tenant_id, status);
