-- PROJ-54: Add quota_overrides JSONB column to tenants
-- Stores owner-set per-period limit overrides.
-- Format: {"ai_performance_analyses": {"limit": 50, "period_end": "2026-05-10T..."}}
-- Override applies only when stored period_end matches current billing period.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS quota_overrides JSONB DEFAULT NULL;

COMMENT ON COLUMN tenants.quota_overrides IS
  'Owner-set per-period quota overrides. Format: {"metric": {"limit": N, "period_end": "ISO"}}. Override applies only when stored period_end matches current billing period.';
