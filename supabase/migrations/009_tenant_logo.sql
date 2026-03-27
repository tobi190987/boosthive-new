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

-- Public read policy for tenant logos (IF NOT EXISTS workaround)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read tenant logos'
  ) THEN
    CREATE POLICY "Public read tenant logos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'tenant-logos');
  END IF;
END $$;
