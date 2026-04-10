-- Migration 042: Track AVV (Auftragsverarbeitungsvertrag) acceptance per tenant
-- Owner can see in the tenant list when an agency has confirmed signing the DPA.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS avv_accepted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avv_accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

COMMENT ON COLUMN tenants.avv_accepted_at IS 'Timestamp when the tenant admin confirmed signing the AV-Vertrag (DPA). NULL = not yet confirmed.';
COMMENT ON COLUMN tenants.avv_accepted_by IS 'User ID of the tenant admin who confirmed the AVV acceptance.';
