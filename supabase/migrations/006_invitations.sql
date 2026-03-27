-- PROJ-7: Member Invitations
-- Token-basierte Einladungen fuer Tenant-Admins und oeffentliche Annahme-Links.

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role member_role NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_name TEXT,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT tenant_invitations_email_not_blank CHECK (length(trim(email)) > 3),
  CONSTRAINT tenant_invitations_token_hash_length CHECK (char_length(token_hash) = 64),
  CONSTRAINT tenant_invitations_accept_consistency CHECK (
    (accepted_at IS NULL AND accepted_user_id IS NULL)
    OR (accepted_at IS NOT NULL AND accepted_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tenant_invitations_tenant_created_idx
  ON tenant_invitations (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_invitations_tenant_token_idx
  ON tenant_invitations (tenant_id, token_hash);

CREATE INDEX IF NOT EXISTS tenant_invitations_tenant_email_idx
  ON tenant_invitations (tenant_id, lower(email));

ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_invitations_select_admin" ON tenant_invitations;
CREATE POLICY "tenant_invitations_select_admin"
  ON tenant_invitations
  FOR SELECT
  TO authenticated
  USING (is_current_user_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "tenant_invitations_select_owner" ON tenant_invitations;
CREATE POLICY "tenant_invitations_select_owner"
  ON tenant_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM platform_admins pa
      WHERE pa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_invitations_insert_deny" ON tenant_invitations;
CREATE POLICY "tenant_invitations_insert_deny"
  ON tenant_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "tenant_invitations_update_deny" ON tenant_invitations;
CREATE POLICY "tenant_invitations_update_deny"
  ON tenant_invitations
  FOR UPDATE
  TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS "tenant_invitations_delete_deny" ON tenant_invitations;
CREATE POLICY "tenant_invitations_delete_deny"
  ON tenant_invitations
  FOR DELETE
  TO authenticated
  USING (FALSE);

CREATE OR REPLACE FUNCTION find_auth_user_by_email(p_email TEXT)
RETURNS TABLE(id UUID, email TEXT, raw_user_meta_data JSONB, raw_app_meta_data JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    u.raw_user_meta_data,
    u.raw_app_meta_data
  FROM auth.users u
  WHERE lower(u.email::TEXT) = lower(trim(p_email))
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION find_auth_user_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_auth_user_by_email(TEXT) TO service_role;
