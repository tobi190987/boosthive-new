-- PROJ-28: Globaler Kunden-Selektor
-- Stores tenant-isolated customers (end-clients of agencies).

CREATE TABLE IF NOT EXISTS customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  UUID,
  name        TEXT        NOT NULL,
  domain      TEXT,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Members and admins of the same tenant can read customers (soft-delete filter in app layer)
CREATE POLICY "customers_select_own_tenant"
  ON customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = customers.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- Only admins can insert (enforced in API layer via requireTenantAdmin)
-- RLS allows insert for any active tenant member; admin check is in the API.
CREATE POLICY "customers_deny_insert"
  ON customers FOR INSERT
  WITH CHECK (false);

CREATE POLICY "customers_deny_update"
  ON customers FOR UPDATE
  USING (false) WITH CHECK (false);

CREATE POLICY "customers_deny_delete"
  ON customers FOR DELETE
  USING (false);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id
  ON customers (tenant_id);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_status
  ON customers (tenant_id, status)
  WHERE deleted_at IS NULL;
