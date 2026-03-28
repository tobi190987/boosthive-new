-- Repair migration: ensure tenant_invitations.claimed_at exists on projects
-- where the table was created before 006_invitations.sql introduced the column.

ALTER TABLE IF EXISTS tenant_invitations
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Ask PostgREST to refresh its schema cache so the new column becomes visible
-- immediately after the migration ran.
NOTIFY pgrst, 'reload schema';
