-- PROJ-1: Subdomain Routing & Tenant Resolution
-- Creates the tenants table with RLS policies and indexes

-- Create enum for tenant status
CREATE TYPE tenant_status AS ENUM ('active', 'inactive');

-- Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Slug must be unique (used as subdomain)
  CONSTRAINT tenants_slug_unique UNIQUE (slug),

  -- Slug validation: lowercase alphanumeric with hyphens, 3-63 chars
  CONSTRAINT tenants_slug_format CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$'
  )
);

-- Enable Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- SELECT: Allow reading active tenants via anon key (needed for middleware resolution)
CREATE POLICY "tenants_select_active"
  ON tenants
  FOR SELECT
  USING (status = 'active');

-- SELECT: Allow reading all tenants (including inactive) for service role
-- Note: service_role bypasses RLS by default, this is for documentation

-- INSERT: Only service_role can create tenants (Owner provisioning - PROJ-2)
-- anon and authenticated users cannot insert
CREATE POLICY "tenants_insert_service_only"
  ON tenants
  FOR INSERT
  WITH CHECK (false);

-- UPDATE: Only service_role can update tenants
CREATE POLICY "tenants_update_service_only"
  ON tenants
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- DELETE: Only service_role can delete tenants
CREATE POLICY "tenants_delete_service_only"
  ON tenants
  FOR DELETE
  USING (false);

-- Indexes

-- Index on slug for fast middleware lookups (unique constraint already creates one,
-- but we add a partial index for active-only lookups)
CREATE INDEX idx_tenants_slug_active
  ON tenants (slug)
  WHERE status = 'active';

-- Index on status for filtering
CREATE INDEX idx_tenants_status
  ON tenants (status);

-- Index on created_at for ordering in admin views
CREATE INDEX idx_tenants_created_at
  ON tenants (created_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed a test tenant for local development
-- This can be removed in production or managed via PROJ-2 provisioning
INSERT INTO tenants (slug, name, status)
VALUES ('test-tenant', 'Test Agentur', 'active')
ON CONFLICT (slug) DO NOTHING;
