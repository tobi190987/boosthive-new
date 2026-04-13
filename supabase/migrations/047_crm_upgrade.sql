-- ============================================================
-- PROJ-61: CRM-Upgrade (Kontaktstatus, Aktivitäten, Onboarding)
-- ============================================================

-- ── customers: neue CRM-Felder ──

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS crm_status TEXT NOT NULL DEFAULT 'active'
    CHECK (crm_status IN ('lead', 'prospect', 'active', 'paused', 'churned')),
  ADD COLUMN IF NOT EXISTS monthly_volume NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS onboarding_checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_customers_crm_status
  ON customers (tenant_id, crm_status)
  WHERE deleted_at IS NULL;

-- ── customer_activities: Aktivitäten-Timeline ──

CREATE TABLE IF NOT EXISTS customer_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  activity_type   TEXT NOT NULL
                    CHECK (activity_type IN ('call', 'meeting', 'email', 'note', 'task')),
  description     TEXT NOT NULL,
  activity_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  follow_up_date  DATE,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_activities_customer
  ON customer_activities (customer_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_customer_activities_followup
  ON customer_activities (tenant_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL;

-- ── RLS ──

ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;

-- All tenant members can read
CREATE POLICY "tenant members read customer_activities"
  ON customer_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = customer_activities.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- All tenant members can insert (story 6: not admin-only)
CREATE POLICY "tenant members insert customer_activities"
  ON customer_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = customer_activities.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- Update: only creator or admin
CREATE POLICY "creator or admin update customer_activities"
  ON customer_activities FOR UPDATE
  TO authenticated
  USING (
    customer_activities.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = customer_activities.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.role      = 'admin'
        AND tenant_members.status    = 'active'
    )
  )
  WITH CHECK (
    customer_activities.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = customer_activities.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.role      = 'admin'
        AND tenant_members.status    = 'active'
    )
  );

-- Delete: only creator or admin
CREATE POLICY "creator or admin delete customer_activities"
  ON customer_activities FOR DELETE
  TO authenticated
  USING (
    customer_activities.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = customer_activities.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.role      = 'admin'
        AND tenant_members.status    = 'active'
    )
  );

-- ── updated_at trigger ──

CREATE OR REPLACE FUNCTION update_customer_activities_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_activities_updated_at ON customer_activities;
CREATE TRIGGER trg_customer_activities_updated_at
  BEFORE UPDATE ON customer_activities
  FOR EACH ROW EXECUTE FUNCTION update_customer_activities_updated_at();
