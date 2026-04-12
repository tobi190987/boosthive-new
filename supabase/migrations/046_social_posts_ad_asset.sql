-- PROJ-58: Ads Library Integration for Social Calendar
-- Adds optional ad asset reference to social_media_posts

ALTER TABLE social_media_posts
  ADD COLUMN ad_asset_id  UUID REFERENCES ad_library_assets(id) ON DELETE SET NULL,
  ADD COLUMN ad_asset_url TEXT;

CREATE INDEX idx_social_posts_ad_asset ON social_media_posts(ad_asset_id) WHERE ad_asset_id IS NOT NULL;
