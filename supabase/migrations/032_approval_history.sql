CREATE TABLE IF NOT EXISTS approval_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'submitted',
      'resubmitted',
      'approved',
      'changes_requested',
      'content_updated'
    )
  ),
  status_after TEXT NOT NULL CHECK (
    status_after IN ('pending_approval', 'approved', 'changes_requested')
  ),
  feedback TEXT,
  actor_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE approval_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read approval request events" ON approval_request_events;
CREATE POLICY "Tenant members can read approval request events"
  ON approval_request_events FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant members can insert approval request events" ON approval_request_events;
CREATE POLICY "Tenant members can insert approval request events"
  ON approval_request_events FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE INDEX IF NOT EXISTS idx_approval_request_events_request_created
  ON approval_request_events(approval_request_id, created_at ASC);
