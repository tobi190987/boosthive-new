-- PROJ-13: Tenant Detail Management
-- Erweitert Tenants um Billing-/Kontaktfelder und fuegt einen atomaren
-- Owner-Flow fuer den Wechsel des Tenant-Admins hinzu.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS billing_company TEXT,
  ADD COLUMN IF NOT EXISTS billing_street TEXT,
  ADD COLUMN IF NOT EXISTS billing_zip TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_country TEXT,
  ADD COLUMN IF NOT EXISTS billing_vat_id TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_website TEXT;

CREATE OR REPLACE FUNCTION assign_tenant_admin(
  p_tenant_id UUID,
  p_new_admin_user_id UUID
)
RETURNS TABLE(previous_admin_user_id UUID, new_admin_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_membership tenant_members%ROWTYPE;
  v_previous_admin_user_id UUID;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  IF p_new_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'new_admin_user_id_required';
  END IF;

  PERFORM 1
  FROM tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_not_found';
  END IF;

  SELECT *
  INTO v_existing_membership
  FROM tenant_members
  WHERE tenant_id = p_tenant_id
    AND user_id = p_new_admin_user_id
  FOR UPDATE;

  SELECT tm.user_id
  INTO v_previous_admin_user_id
  FROM tenant_members tm
  WHERE tm.tenant_id = p_tenant_id
    AND tm.role = 'admin'
    AND tm.status = 'active'
    AND tm.user_id <> p_new_admin_user_id
  ORDER BY tm.invited_at ASC, tm.id ASC
  LIMIT 1
  FOR UPDATE;

  UPDATE tenant_members
  SET role = 'member'
  WHERE tenant_id = p_tenant_id
    AND role = 'admin'
    AND user_id <> p_new_admin_user_id;

  IF FOUND THEN
    previous_admin_user_id := v_previous_admin_user_id;
  ELSE
    previous_admin_user_id := NULL;
  END IF;

  IF v_existing_membership.id IS NULL THEN
    INSERT INTO tenant_members (user_id, tenant_id, role, status, invited_at)
    VALUES (p_new_admin_user_id, p_tenant_id, 'admin', 'active', now());
  ELSE
    UPDATE tenant_members
    SET role = 'admin',
        status = 'active'
    WHERE id = v_existing_membership.id;
  END IF;

  new_admin_user_id := p_new_admin_user_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION assign_tenant_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_tenant_admin(UUID, UUID) TO service_role;
