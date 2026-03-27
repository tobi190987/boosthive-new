-- PROJ-13: Tenant Logo Support
-- Adds logo_url column and creates public storage bucket for tenant logos

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create public storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-logos',
  'tenant-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Public read policy for tenant logos
CREATE POLICY IF NOT EXISTS "Public read tenant logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-logos');
