-- PROJ-29: Customer Database (CRM & Vault) - Database Schema
-- Migration script for enhanced customer management

-- 1. Extend existing customers table with new fields
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Add unique constraint for domain to prevent duplicates
ALTER TABLE customers 
ADD CONSTRAINT customers_domain_tenant_unique UNIQUE (domain, tenant_id) DEFERRABLE INITIALLY DEFERRED;

-- 2. Create customer_integrations table for credentials vault
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

-- 3. Create customer_documents table for document links
CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create storage bucket for customer logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-logos', 
  'customer-logos', 
  true, 
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- 5. Enable Row Level Security on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for customers (enhanced)
DROP POLICY IF EXISTS "Tenants can view own customers" ON customers;
CREATE POLICY "Tenants can view own customers" ON customers
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

DROP POLICY IF EXISTS "Admins can insert own customers" ON customers;
CREATE POLICY "Admins can insert own customers" ON customers
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

DROP POLICY IF EXISTS "Admins can update own customers" ON customers;
CREATE POLICY "Admins can update own customers" ON customers
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

DROP POLICY IF EXISTS "Admins can delete own customers" ON customers;
CREATE POLICY "Admins can delete own customers" ON customers
  FOR DELETE USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- 7. Create RLS policies for customer_integrations
CREATE POLICY "Tenants can view own customer integrations" ON customer_integrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_integrations.customer_id 
      AND customers.tenant_id = current_setting('app.current_tenant', true)::uuid
    )
  );

CREATE POLICY "Admins can manage own customer integrations" ON customer_integrations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_integrations.customer_id 
      AND customers.tenant_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- 8. Create RLS policies for customer_documents
CREATE POLICY "Tenants can view own customer documents" ON customer_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_documents.customer_id 
      AND customers.tenant_id = current_setting('app.current_tenant', true)::uuid
    )
  );

CREATE POLICY "Tenants can manage own customer documents" ON customer_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_documents.customer_id 
      AND customers.tenant_id = current_setting('app.current_tenant', true)::uuid
    )
  );

-- 9. Create storage policies for customer logos
CREATE POLICY "Tenants can upload own customer logos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'customer-logos' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = current_setting('app.current_tenant', true)::text
  );

CREATE POLICY "Tenants can view own customer logos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'customer-logos' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Tenants can update own customer logos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'customer-logos' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = current_setting('app.current_tenant', true)::text
  );

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_domain_tenant ON customers(domain, tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_integrations_customer_id ON customer_integrations(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_integrations_type ON customer_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);

-- 11. Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 12. Create triggers for updated_at
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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

-- 13. Create cleanup function for soft-deleted customers
CREATE OR REPLACE FUNCTION cleanup_soft_deleted_customers()
RETURNS void AS $$
BEGIN
  -- Delete customers that were soft-deleted more than 30 days ago
  DELETE FROM customers 
  WHERE deleted_at IS NOT NULL 
  AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 14. Grant permissions
GRANT ALL ON customers TO authenticated;
GRANT ALL ON customer_integrations TO authenticated;
GRANT ALL ON customer_documents TO authenticated;
GRANT USAGE ON ALL SEQUENCES TO authenticated;

-- Migration complete
SELECT 'PROJ-29 Customer Database migration completed successfully' as status;
