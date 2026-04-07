-- PROJ-36: Shared kanban workflow state across content and ads

ALTER TABLE content_briefs
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'none'
  CHECK (workflow_status IN ('none', 'in_progress', 'client_review', 'done'));

ALTER TABLE content_briefs
  ADD COLUMN IF NOT EXISTS workflow_status_changed_at TIMESTAMPTZ;

ALTER TABLE content_briefs
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'changes_requested'));

UPDATE content_briefs
SET workflow_status = CASE approval_status
  WHEN 'pending_approval' THEN 'client_review'
  WHEN 'approved' THEN 'done'
  WHEN 'changes_requested' THEN 'in_progress'
  ELSE 'none'
END
WHERE workflow_status = 'none';

CREATE INDEX IF NOT EXISTS idx_content_briefs_workflow_status
  ON content_briefs(tenant_id, workflow_status, updated_at DESC);

ALTER TABLE ad_generations
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'none'
  CHECK (workflow_status IN ('none', 'in_progress', 'client_review', 'done'));

ALTER TABLE ad_generations
  ADD COLUMN IF NOT EXISTS workflow_status_changed_at TIMESTAMPTZ;

ALTER TABLE ad_generations
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft';

UPDATE ad_generations
SET workflow_status = CASE approval_status
  WHEN 'pending_approval' THEN 'client_review'
  WHEN 'approved' THEN 'done'
  WHEN 'changes_requested' THEN 'in_progress'
  ELSE 'none'
END
WHERE workflow_status = 'none';

CREATE INDEX IF NOT EXISTS idx_ad_generations_workflow_status
  ON ad_generations(tenant_id, workflow_status, updated_at DESC);

ALTER TABLE ad_library_assets
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'none'
  CHECK (workflow_status IN ('none', 'in_progress', 'client_review', 'done'));

ALTER TABLE ad_library_assets
  ADD COLUMN IF NOT EXISTS workflow_status_changed_at TIMESTAMPTZ;

ALTER TABLE ad_library_assets
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'changes_requested'));

UPDATE ad_library_assets
SET workflow_status = CASE approval_status
  WHEN 'pending_approval' THEN 'client_review'
  WHEN 'approved' THEN 'done'
  WHEN 'changes_requested' THEN 'in_progress'
  ELSE 'none'
END
WHERE workflow_status = 'none';

CREATE INDEX IF NOT EXISTS idx_ad_library_assets_workflow_status
  ON ad_library_assets(tenant_id, workflow_status, updated_at DESC)
  WHERE deleted_at IS NULL;
