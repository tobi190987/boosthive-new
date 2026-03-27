-- PROJ-5: Password Reset Flow
-- Creates password_reset_tokens plus RPC helpers for request/consume flow.

-- ============================================================================
-- 1. password_reset_tokens
-- ============================================================================

CREATE TYPE password_reset_status AS ENUM ('pending', 'active', 'used', 'invalidated');

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  status password_reset_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT password_reset_tokens_hash_length CHECK (char_length(token_hash) >= 32),
  CONSTRAINT password_reset_tokens_used_consistency CHECK (
    (status = 'used' AND used_at IS NOT NULL)
    OR (status <> 'used')
  )
);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "password_reset_tokens_select_deny"
  ON password_reset_tokens
  FOR SELECT
  USING (false);

CREATE POLICY "password_reset_tokens_insert_deny"
  ON password_reset_tokens
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "password_reset_tokens_update_deny"
  ON password_reset_tokens
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "password_reset_tokens_delete_deny"
  ON password_reset_tokens
  FOR DELETE
  USING (false);

CREATE INDEX idx_password_reset_tokens_lookup
  ON password_reset_tokens (tenant_id, token_hash, status, expires_at);

CREATE INDEX idx_password_reset_tokens_user_tenant
  ON password_reset_tokens (user_id, tenant_id, status, created_at DESC);

CREATE INDEX idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at);

-- ============================================================================
-- 2. RPC: create_password_reset_request
-- ============================================================================

CREATE OR REPLACE FUNCTION create_password_reset_request(
  p_email TEXT,
  p_tenant_id UUID,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_tenant_slug TEXT;
  v_tenant_name TEXT;
BEGIN
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'E-Mail darf nicht leer sein.';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant-ID darf nicht NULL sein.';
  END IF;

  IF p_token_hash IS NULL OR char_length(trim(p_token_hash)) < 32 THEN
    RAISE EXCEPTION 'Token-Hash ist ungueltig.';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'Ablaufdatum muss in der Zukunft liegen.';
  END IF;

  SELECT t.slug, t.name
  INTO v_tenant_slug, v_tenant_name
  FROM tenants t
  WHERE t.id = p_tenant_id
    AND t.status = 'active';

  IF v_tenant_slug IS NULL THEN
    RETURN json_build_object(
      'created', false
    );
  END IF;

  SELECT u.id, u.email
  INTO v_user_id, v_email
  FROM auth.users u
  INNER JOIN tenant_members tm
    ON tm.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
    AND tm.tenant_id = p_tenant_id
    AND tm.status = 'active'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'created', false
    );
  END IF;

  INSERT INTO password_reset_tokens (
    user_id,
    tenant_id,
    token_hash,
    status,
    expires_at
  )
  VALUES (
    v_user_id,
    p_tenant_id,
    p_token_hash,
    'pending',
    p_expires_at
  );

  RETURN json_build_object(
    'created', true,
    'token_id', (
      SELECT id
      FROM password_reset_tokens
      WHERE user_id = v_user_id
        AND tenant_id = p_tenant_id
        AND token_hash = p_token_hash
      ORDER BY created_at DESC
      LIMIT 1
    ),
    'user_id', v_user_id,
    'email', v_email,
    'tenant_slug', v_tenant_slug,
    'tenant_name', v_tenant_name
  );
END;
$$;

REVOKE ALL ON FUNCTION create_password_reset_request(TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_password_reset_request(TEXT, UUID, TEXT, TIMESTAMPTZ) TO service_role;

-- ============================================================================
-- 3. RPC: finalize_password_reset_request
-- ============================================================================

CREATE OR REPLACE FUNCTION finalize_password_reset_request(
  p_token_id UUID,
  p_user_id UUID,
  p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  IF p_token_id IS NULL OR p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN json_build_object(
      'finalized', false
    );
  END IF;

  UPDATE password_reset_tokens AS current_token
  SET status = 'active'
  WHERE current_token.id = p_token_id
    AND current_token.user_id = p_user_id
    AND current_token.tenant_id = p_tenant_id
    AND current_token.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM password_reset_tokens newer
      WHERE newer.user_id = current_token.user_id
        AND newer.tenant_id = current_token.tenant_id
        AND newer.id <> current_token.id
        AND newer.status IN ('pending', 'active')
        AND (
          newer.created_at > current_token.created_at
          OR (
            newer.created_at = current_token.created_at
            AND newer.id::text > current_token.id::text
          )
        )
    )
  RETURNING id
  INTO v_token_id;

  IF v_token_id IS NULL THEN
    RETURN json_build_object(
      'finalized', false
    );
  END IF;

  UPDATE password_reset_tokens
  SET status = 'invalidated'
  WHERE user_id = p_user_id
    AND tenant_id = p_tenant_id
    AND status = 'active'
    AND id <> p_token_id;

  RETURN json_build_object(
    'finalized', true
  );
END;
$$;

REVOKE ALL ON FUNCTION finalize_password_reset_request(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_password_reset_request(UUID, UUID, UUID) TO service_role;

-- ============================================================================
-- 4. RPC: cancel_password_reset_request
-- ============================================================================

CREATE OR REPLACE FUNCTION cancel_password_reset_request(
  p_token_id UUID,
  p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  IF p_token_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN json_build_object(
      'cancelled', false
    );
  END IF;

  UPDATE password_reset_tokens
  SET status = 'invalidated'
  WHERE id = p_token_id
    AND tenant_id = p_tenant_id
    AND status = 'pending'
  RETURNING id
  INTO v_token_id;

  RETURN json_build_object(
    'cancelled', v_token_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION cancel_password_reset_request(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_password_reset_request(UUID, UUID) TO service_role;

-- ============================================================================
-- 5. RPC: consume_password_reset_token
-- ============================================================================

CREATE OR REPLACE FUNCTION consume_password_reset_token(
  p_token_hash TEXT,
  p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_token RECORD;
  v_email TEXT;
  v_role member_role;
BEGIN
  IF p_token_hash IS NULL OR char_length(trim(p_token_hash)) < 32 THEN
    RETURN json_build_object(
      'consumed', false
    );
  END IF;

  IF p_tenant_id IS NULL THEN
    RETURN json_build_object(
      'consumed', false
    );
  END IF;

  UPDATE password_reset_tokens prt
  SET status = 'used',
      used_at = now()
  WHERE prt.id = (
    SELECT id
    FROM password_reset_tokens
    WHERE token_hash = p_token_hash
      AND tenant_id = p_tenant_id
      AND status = 'active'
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1
  )
  RETURNING prt.id, prt.user_id, prt.tenant_id
  INTO v_token;

  IF v_token.id IS NULL THEN
    RETURN json_build_object(
      'consumed', false
    );
  END IF;

  SELECT u.email, tm.role
  INTO v_email, v_role
  FROM auth.users u
  INNER JOIN tenant_members tm
    ON tm.user_id = u.id
  WHERE u.id = v_token.user_id
    AND tm.tenant_id = v_token.tenant_id
    AND tm.status = 'active'
  LIMIT 1;

  IF v_email IS NULL THEN
    RETURN json_build_object(
      'consumed', false
    );
  END IF;

  UPDATE password_reset_tokens
  SET status = 'invalidated'
  WHERE user_id = v_token.user_id
    AND tenant_id = v_token.tenant_id
    AND status = 'active';

  RETURN json_build_object(
    'consumed', true,
    'token_id', v_token.id,
    'user_id', v_token.user_id,
    'email', v_email,
    'role', v_role
  );
END;
$$;

REVOKE ALL ON FUNCTION consume_password_reset_token(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_password_reset_token(TEXT, UUID) TO service_role;
