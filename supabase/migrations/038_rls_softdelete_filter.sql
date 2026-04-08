-- PROJ-48: Security Hardening — RLS Soft-Delete Filter
-- Ergänzt deleted_at IS NULL in allen RLS-SELECT-Policies für Tabellen mit soft-delete.
-- Bisher wurde deleted_at nur im App-Layer gefiltert; bei direktem DB-Zugriff (z.B. Supabase JS Client
-- ohne Service-Role) wären soft-gelöschte Einträge lesbar gewesen.

-- customers: deleted_at in SELECT-Policy einbeziehen
DROP POLICY IF EXISTS "customers_select_own_tenant" ON customers;
CREATE POLICY "customers_select_own_tenant"
  ON customers FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = customers.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- customer_integrations: via customers JOIN — soft-deleted customers schützen
DROP POLICY IF EXISTS "Tenants can view own customer integrations" ON customer_integrations;
CREATE POLICY "Tenants can view own customer integrations"
  ON customer_integrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id         = customer_integrations.customer_id
        AND customers.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM tenant_members
          WHERE tenant_members.tenant_id = customers.tenant_id
            AND tenant_members.user_id   = auth.uid()
            AND tenant_members.status    = 'active'
        )
    )
  );

-- customer_documents: analog zu customer_integrations
DROP POLICY IF EXISTS "Tenants can view own customer documents" ON customer_documents;
CREATE POLICY "Tenants can view own customer documents"
  ON customer_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id         = customer_documents.customer_id
        AND customers.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM tenant_members
          WHERE tenant_members.tenant_id = customers.tenant_id
            AND tenant_members.user_id   = auth.uid()
            AND tenant_members.status    = 'active'
        )
    )
  );
