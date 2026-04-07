-- PROJ-DSGVO: Tenant Daten-Audit-Logs
-- Speichert Nachweise zu Export- und Löschaktionen pro Tenant/User.

CREATE TABLE IF NOT EXISTS tenant_data_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('data_export', 'data_delete')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_data_audit_logs_tenant_created_at
  ON tenant_data_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_data_audit_logs_actor_created_at
  ON tenant_data_audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_data_audit_logs_action_created_at
  ON tenant_data_audit_logs (action_type, created_at DESC);

ALTER TABLE tenant_data_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_data_audit_logs_select_own_tenant"
  ON tenant_data_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = tenant_data_audit_logs.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.status = 'active'
    )
  );

CREATE POLICY "tenant_data_audit_logs_insert_deny"
  ON tenant_data_audit_logs
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "tenant_data_audit_logs_update_deny"
  ON tenant_data_audit_logs
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "tenant_data_audit_logs_delete_deny"
  ON tenant_data_audit_logs
  FOR DELETE
  USING (false);
