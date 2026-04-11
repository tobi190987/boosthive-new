-- Migration 043: PROJ-55 Reporting & Export Center
-- Creates the exports tracking table, adds brand_color to customers,
-- and registers the private Supabase Storage bucket for export files.

-- ─── exports table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exports (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
  export_type       TEXT        NOT NULL CHECK (export_type IN (
                                  'keyword_rankings',
                                  'marketing_dashboard',
                                  'gsc_discovery',
                                  'customer_report'
                                )),
  format            TEXT        NOT NULL CHECK (format IN ('pdf', 'png', 'xlsx')),
  customer_id       UUID        REFERENCES customers(id) ON DELETE SET NULL,
  branding_source   TEXT        NOT NULL DEFAULT 'tenant' CHECK (branding_source IN ('tenant', 'customer')),
  brand_color       TEXT        NOT NULL DEFAULT '#2563eb',
  status            TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'done', 'failed')),
  storage_path      TEXT,
  file_name         TEXT,
  error_message     TEXT,
  email_sent_at     TIMESTAMPTZ,
  email_sent_to     TEXT,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exports_tenant_created
  ON exports (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exports_customer_id
  ON exports (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exports_status
  ON exports (tenant_id, status)
  WHERE status IN ('pending', 'generating');

-- RLS
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exports_select_own_tenant"
  ON exports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = exports.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

CREATE POLICY "exports_insert_own_tenant"
  ON exports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = exports.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

CREATE POLICY "exports_update_own_tenant"
  ON exports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = exports.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.status    = 'active'
    )
  );

-- No direct DELETE via client — exports are managed by the API only
CREATE POLICY "exports_delete_deny"
  ON exports FOR DELETE
  USING (false);

-- ─── brand_color on customers ───────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS brand_color TEXT;

COMMENT ON COLUMN customers.brand_color IS 'Optional hex color for White-Label PDF/PNG exports (e.g. #2563eb).';

-- ─── Supabase Storage bucket ────────────────────────────────────────────────
-- Private bucket for generated export files (PDF, PNG, XLSX).
-- Access only via signed URLs generated server-side.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  52428800,  -- 50 MB per file
  ARRAY[
    'application/pdf',
    'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: only service role (admin client) can manage export files.
-- Tenant members access files exclusively via signed URLs.
CREATE POLICY "exports_storage_service_role_only"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'exports')
  WITH CHECK (bucket_id = 'exports');
