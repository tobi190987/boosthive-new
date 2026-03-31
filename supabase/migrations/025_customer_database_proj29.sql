-- PROJ-29: Customer Database (CRM & Vault) - Database Schema

-- 1. Extend existing customers table with new fields
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- 2. Add unique constraint for domain to prevent duplicates within same tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_domain_tenant_unique'
  ) THEN
    ALTER TABLE customers
    ADD CONSTRAINT customers_domain_tenant_unique UNIQUE (domain, tenant_id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

-- 3. Create customer_integrations table for credentials vault
CREATE TABLE IF NOT EXISTS customer_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('google_ads', 'meta_pixel', 'openai', 'gsc')),
  status TEXT NOT NULL CHECK (status IN ('connected', 'active', 'disconnected')),
  credentials_encrypted TEXT,
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, integration_type)
);

-- 4. Create customer_documents table for document links
CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable Row Level Security on new tables
ALTER TABLE customer_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for customer_integrations
CREATE POLICY "Tenants can view own customer integrations" ON customer_integrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = customer_integrations.customer_id
      AND EXISTS (
        SELECT 1 FROM tenant_members
        WHERE tenant_members.tenant_id = customers.tenant_id
          AND tenant_members.user_id = auth.uid()
          AND tenant_members.status = 'active'
      )
    )
  );

CREATE POLICY "Deny direct insert customer integrations" ON customer_integrations
  FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny direct update customer integrations" ON customer_integrations
  FOR UPDATE USING (false);

CREATE POLICY "Deny direct delete customer integrations" ON customer_integrations
  FOR DELETE USING (false);

-- 7. Create RLS policies for customer_documents
CREATE POLICY "Tenants can view own customer documents" ON customer_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = customer_documents.customer_id
      AND EXISTS (
        SELECT 1 FROM tenant_members
        WHERE tenant_members.tenant_id = customers.tenant_id
          AND tenant_members.user_id = auth.uid()
          AND tenant_members.status = 'active'
      )
    )
  );

CREATE POLICY "Deny direct insert customer documents" ON customer_documents
  FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny direct update customer documents" ON customer_documents
  FOR UPDATE USING (false);

CREATE POLICY "Deny direct delete customer documents" ON customer_documents
  FOR DELETE USING (false);

-- 8. Create storage bucket for customer logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-logos',
  'customer-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customer_integrations_customer_id ON customer_integrations(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);

-- 10. Create updated_at trigger for new tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_customer_integrations_updated_at ON customer_integrations;
CREATE TRIGGER update_customer_integrations_updated_at
  BEFORE UPDATE ON customer_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_documents_updated_at ON customer_documents;
CREATE TRIGGER update_customer_documents_updated_at
  BEFORE UPDATE ON customer_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
