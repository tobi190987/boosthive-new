-- PROJ-20: Tenant Soft Delete
-- Fuegt Archivierungsmetadaten fuer Tenants hinzu.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tenants_archived_at
  ON tenants (archived_at DESC)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_active_created_at
  ON tenants (created_at DESC)
  WHERE archived_at IS NULL;
