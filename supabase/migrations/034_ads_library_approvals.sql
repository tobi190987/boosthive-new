-- PROJ-35 follow-up: Client approvals for Ads Library assets

ALTER TABLE ad_library_assets
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'changes_requested'));

ALTER TABLE approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_content_type_check;

ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_content_type_check
  CHECK (content_type IN ('content_brief', 'ad_generation', 'ad_library_asset'));
