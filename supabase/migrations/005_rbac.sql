-- PROJ-6: Role-Based Access Control (RBAC)
-- Erweitert die RLS-Policies um rollen-basierte Zugriffsregeln fuer tenant_members.
--
-- Vorher: Nur service_role darf UPDATE; authenticated User sehen nur eigene Zeile.
-- Nachher: Admin kann alle Members seines Tenants SELECTen.
--          UPDATE bleibt service_role-only (API-Route mit requireTenantAdmin() uebernimmt Autorisierung).
--          Admin-Pruefungen lesen die aktuelle DB-Membership statt veraltbare JWT-Claims.

-- ============================================================================
-- 1. Helper: aktuelle Admin-Membership serverseitig pruefen
-- ============================================================================
CREATE OR REPLACE FUNCTION is_current_user_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = p_tenant_id
      AND tm.role = 'admin'
      AND tm.status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION is_current_user_tenant_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_current_user_tenant_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_current_user_tenant_admin(UUID) TO service_role;

-- ============================================================================
-- 2. SELECT: Admin darf alle Members seines eigenen Tenants lesen
-- ============================================================================
-- Wird benoetigt fuer: Member-Liste in /settings/members (PROJ-6), Einladungs-Flow (PROJ-7)
DROP POLICY IF EXISTS "tenant_members_select_admin" ON tenant_members;

CREATE POLICY "tenant_members_select_admin"
  ON tenant_members
  FOR SELECT
  TO authenticated
  USING (is_current_user_tenant_admin(tenant_id));

-- ============================================================================
-- 3. RPC: Transaktionales Rollen-Update mit Last-Admin-Schutz
-- ============================================================================
CREATE OR REPLACE FUNCTION set_tenant_member_role(
  p_member_id UUID,
  p_tenant_id UUID,
  p_new_role member_role,
  p_requesting_user_id UUID
)
RETURNS TABLE(user_id UUID, role member_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target tenant_members%ROWTYPE;
  v_admin_count BIGINT;
BEGIN
  SELECT *
  INTO v_target
  FROM tenant_members
  WHERE id = p_member_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found';
  END IF;

  IF v_target.user_id = p_requesting_user_id THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;

  IF v_target.role = 'admin' AND p_new_role = 'member' THEN
    PERFORM 1
    FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND role = 'admin'
      AND status = 'active'
    FOR UPDATE;

    SELECT COUNT(*)
    INTO v_admin_count
    FROM tenant_members
    WHERE tenant_id = p_tenant_id
      AND role = 'admin'
      AND status = 'active';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot_demote_last_admin';
    END IF;
  END IF;

  UPDATE tenant_members
  SET role = p_new_role
  WHERE id = v_target.id
  RETURNING tenant_members.user_id, tenant_members.role
  INTO user_id, role;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION set_tenant_member_role(UUID, UUID, member_role, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_tenant_member_role(UUID, UUID, member_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_tenant_member_role(UUID, UUID, member_role, UUID) TO service_role;

-- ============================================================================
-- 4. Hinweis: UPDATE bleibt service_role-only (kein RLS-Update noetig)
-- ============================================================================
-- Die API-Route PATCH /api/tenant/members/[id]/role verwendet den Admin-Client
-- (service_role), der RLS umgeht. Die Autorisierung erfolgt in requireTenantAdmin().
-- Defense-in-depth: Die bestehende "tenant_members_update_deny"-Policy bleibt aktiv.
-- Bei direktem DB-Zugriff (ohne API) sind Updates weiterhin blockiert.
