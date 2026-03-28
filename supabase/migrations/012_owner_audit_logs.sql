-- PROJ-17: Owner Audit Log
-- Revisionssichere Audit-Events fuer Owner-Aktionen

CREATE TABLE IF NOT EXISTS owner_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants (id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_audit_logs_tenant_id_created_at
  ON owner_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_audit_logs_actor_user_id_created_at
  ON owner_audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_audit_logs_event_type_created_at
  ON owner_audit_logs (event_type, created_at DESC);

ALTER TABLE owner_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_audit_logs_select_owner"
  ON owner_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "owner_audit_logs_insert_deny"
  ON owner_audit_logs
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "owner_audit_logs_update_deny"
  ON owner_audit_logs
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "owner_audit_logs_delete_deny"
  ON owner_audit_logs
  FOR DELETE
  USING (false);
