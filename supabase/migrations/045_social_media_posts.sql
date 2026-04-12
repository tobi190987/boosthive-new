-- PROJ-58: Social Media Kalender
-- Tabelle für Social-Media-Posts mit Planung, Status-Workflow und Team-Zuordnung

CREATE TABLE social_media_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  title       TEXT NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 500),
  caption     TEXT,
  platforms   TEXT[] NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','in_progress','review','approved','published')),
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_social_posts_tenant        ON social_media_posts(tenant_id);
CREATE INDEX idx_social_posts_scheduled     ON social_media_posts(tenant_id, scheduled_at);
CREATE INDEX idx_social_posts_customer      ON social_media_posts(customer_id) WHERE customer_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_social_posts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_social_posts_updated_at
  BEFORE UPDATE ON social_media_posts
  FOR EACH ROW EXECUTE FUNCTION update_social_posts_updated_at();

-- Row Level Security
ALTER TABLE social_media_posts ENABLE ROW LEVEL SECURITY;

-- Members of a tenant can read all posts of their tenant
CREATE POLICY "tenant_members_select_social_posts"
  ON social_media_posts FOR SELECT
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_memberships tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

-- Members can create posts for their tenant
CREATE POLICY "tenant_members_insert_social_posts"
  ON social_media_posts FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_memberships tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

-- Members can update posts of their tenant
CREATE POLICY "tenant_members_update_social_posts"
  ON social_media_posts FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_memberships tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

-- Members can delete posts of their tenant
CREATE POLICY "tenant_members_delete_social_posts"
  ON social_media_posts FOR DELETE
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_memberships tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );
