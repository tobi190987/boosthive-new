-- PROJ-16: Owner Billing-Uebersicht
-- Adds owner lock metadata columns to tenants for manual access overrides

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS owner_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_locked_by UUID,
  ADD COLUMN IF NOT EXISTS owner_lock_reason TEXT;

-- Index for quick filtering of locked tenants in owner billing overview
CREATE INDEX IF NOT EXISTS idx_tenants_owner_locked_at
  ON tenants (owner_locked_at)
  WHERE owner_locked_at IS NOT NULL;
