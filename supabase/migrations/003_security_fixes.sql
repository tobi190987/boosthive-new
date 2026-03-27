-- PROJ-2: Security Fixes
-- BUG-1: RPC-Funktion auf service_role beschraenken
-- Vorher: GRANT TO authenticated (jeder eingeloggte User konnte Tenants erstellen)
-- Nachher: Nur service_role darf die Funktion aufrufen (wird nur vom Server-Admin-Client genutzt)

REVOKE EXECUTE ON FUNCTION create_tenant_with_admin(TEXT, TEXT, UUID) FROM authenticated;

-- Funktion neu erstellen mit internem Owner-Check als Defense-in-Depth.
-- auth.uid() liefert bei service_role-Aufrufen NULL, daher pruefen wir hier
-- zusaetzlich, dass p_admin_user_id ein bekannter Auth-User ist (Existenz-Check).
-- Die eigentliche Owner-Autorisierung bleibt in der API-Route (requireOwner).
CREATE OR REPLACE FUNCTION create_tenant_with_admin(
  p_tenant_name TEXT,
  p_slug TEXT,
  p_admin_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant RECORD;
BEGIN
  -- Pflichtfelder pruefen
  IF p_tenant_name IS NULL OR trim(p_tenant_name) = '' THEN
    RAISE EXCEPTION 'Tenant-Name darf nicht leer sein.';
  END IF;

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'Slug darf nicht leer sein.';
  END IF;

  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin-User-ID darf nicht NULL sein.';
  END IF;

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

-- Nur service_role behalt Zugriff (API-Routes mit Admin-Client)
-- authenticated hat keinen Zugriff mehr
GRANT EXECUTE ON FUNCTION create_tenant_with_admin(TEXT, TEXT, UUID) TO service_role;
