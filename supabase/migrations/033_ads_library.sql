-- PROJ-35: Ads Library

CREATE TABLE IF NOT EXISTS ad_library_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT NOT NULL,
  file_format TEXT NOT NULL,
  width_px INTEGER NOT NULL CHECK (width_px > 0),
  height_px INTEGER NOT NULL CHECK (height_px > 0),
  duration_seconds NUMERIC(10, 2),
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  aspect_ratio NUMERIC(12, 6) NOT NULL,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE ad_library_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read ad library assets"
  ON ad_library_assets FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Tenant members can create ad library assets"
  ON ad_library_assets FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Tenant members can update ad library assets"
  ON ad_library_assets FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Tenant members can delete ad library assets"
  ON ad_library_assets FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE INDEX IF NOT EXISTS idx_ad_library_assets_tenant_id ON ad_library_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_library_assets_customer_id ON ad_library_assets(customer_id);
CREATE INDEX IF NOT EXISTS idx_ad_library_assets_media_type ON ad_library_assets(media_type);
CREATE INDEX IF NOT EXISTS idx_ad_library_assets_created_at ON ad_library_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_library_assets_tenant_customer ON ad_library_assets(tenant_id, customer_id);

CREATE OR REPLACE FUNCTION update_ad_library_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ad_library_assets_updated_at ON ad_library_assets;

CREATE TRIGGER ad_library_assets_updated_at
  BEFORE UPDATE ON ad_library_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_library_assets_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-library-assets',
  'ad-library-assets',
  true,
  104857600,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
) ON CONFLICT (id) DO NOTHING;
