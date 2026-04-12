-- PROJ-58 follow-up: format metadata and approval support for social posts

ALTER TABLE social_media_posts
  ADD COLUMN IF NOT EXISTS post_format TEXT NOT NULL DEFAULT 'instagram_feed'
  CHECK (
    post_format IN (
      'instagram_feed',
      'instagram_reel',
      'facebook_post',
      'linkedin_post',
      'tiktok_video'
    )
  );

ALTER TABLE approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_content_type_check;

ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_content_type_check
  CHECK (
    content_type IN (
      'content_brief',
      'ad_generation',
      'ad_library_asset',
      'social_media_post'
    )
  );
