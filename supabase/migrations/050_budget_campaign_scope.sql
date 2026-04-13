-- ============================================================
-- PROJ-57 Extension: Campaign-level budget tracking
-- Adds campaign_ids field to ad_budgets so a budget tracker
-- can be scoped to one or more specific ad campaigns.
-- NULL / empty array = track all campaigns (existing behaviour).
-- ============================================================

ALTER TABLE ad_budgets
  ADD COLUMN IF NOT EXISTS campaign_ids TEXT[];

COMMENT ON COLUMN ad_budgets.campaign_ids IS
  'NULL or empty = all campaigns. Non-empty = only track these campaign IDs.';
