-- PROJ-2: Tenant Provisioning
-- Creates platform_admins, tenant_members tables, RPC function, and RLS policies

-- ============================================================================
-- 1. platform_admins — Owner-Zugriffstabelle
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- SELECT: Authentifizierte User duerfen nur ihren eigenen Eintrag lesen
CREATE POLICY "platform_admins_select_own"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE: Nur service_role (kein normaler User darf schreiben)
CREATE POLICY "platform_admins_insert_deny"
  ON platform_admins
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "platform_admins_update_deny"
  ON platform_admins
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "platform_admins_delete_deny"
  ON platform_admins
  FOR DELETE
  USING (false);

-- ============================================================================
-- 2. tenant_members — Zuordnung User <-> Tenant mit Rolle
-- ============================================================================

CREATE TYPE member_role AS ENUM ('admin', 'member');
CREATE TYPE member_status AS ENUM ('active', 'inactive');

CREATE TABLE IF NOT EXISTS tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  status member_status NOT NULL DEFAULT 'active',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ,

  -- Ein User kann nur einmal pro Tenant existieren
  CONSTRAINT tenant_members_unique_user_tenant UNIQUE (user_id, tenant_id)
);

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

-- SELECT: User darf eigene Memberships lesen
CREATE POLICY "tenant_members_select_own"
  ON tenant_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- SELECT: Owner (platform_admins) darf alle Memberships lesen
CREATE POLICY "tenant_members_select_owner"
  ON tenant_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  );

-- INSERT: Nur service_role
CREATE POLICY "tenant_members_insert_deny"
  ON tenant_members
  FOR INSERT
  WITH CHECK (false);

-- UPDATE: Nur service_role
CREATE POLICY "tenant_members_update_deny"
  ON tenant_members
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- DELETE: Nur service_role
CREATE POLICY "tenant_members_delete_deny"
  ON tenant_members
  FOR DELETE
  USING (false);

-- Indexes
CREATE INDEX idx_tenant_members_user_id ON tenant_members (user_id);
CREATE INDEX idx_tenant_members_tenant_id ON tenant_members (tenant_id);
CREATE INDEX idx_tenant_members_tenant_role ON tenant_members (tenant_id, role);

-- ============================================================================
-- 3. Erweiterte RLS fuer tenants — Owner darf alles lesen/schreiben
-- ============================================================================

-- Owner darf alle Tenants lesen (inkl. inactive)
CREATE POLICY "tenants_select_owner"
  ON tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  );

-- Owner darf Tenants aktualisieren
CREATE POLICY "tenants_update_owner"
  ON tenants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  );

-- Owner darf Tenants erstellen
CREATE POLICY "tenants_insert_owner"
  ON tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. RPC: Atomare Tenant-Erstellung mit Admin-Zuweisung
-- ============================================================================

CREATE OR REPLACE FUNCTION create_tenant_with_admin(
  p_tenant_name TEXT,
  p_slug TEXT,
  p_admin_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  -- laeuft mit den Rechten des Funktionsbesitzers (service role)
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant RECORD;
BEGIN
  -- Tenant erstellen
  INSERT INTO tenants (name, slug, status)
  VALUES (p_tenant_name, p_slug, 'active')
  RETURNING id INTO v_tenant_id;

  -- Admin-Membership erstellen
  INSERT INTO tenant_members (user_id, tenant_id, role, status, invited_at)
  VALUES (p_admin_user_id, v_tenant_id, 'admin', 'active', now());

  -- Tenant-Daten zurueckgeben
  SELECT id, name, slug, status, created_at
  INTO v_tenant
  FROM tenants
  WHERE id = v_tenant_id;

  RETURN json_build_object(
    'id', v_tenant.id,
    'name', v_tenant.name,
    'slug', v_tenant.slug,
    'status', v_tenant.status,
    'created_at', v_tenant.created_at
  );
END;
$$;

-- Nur authentifizierte User (Owners) koennen die Funktion aufrufen.
-- Die eigentliche Owner-Pruefung passiert in der API-Route (doppelter Check).
REVOKE ALL ON FUNCTION create_tenant_with_admin(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_with_admin(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_tenant_with_admin(TEXT, TEXT, UUID) TO service_role;
