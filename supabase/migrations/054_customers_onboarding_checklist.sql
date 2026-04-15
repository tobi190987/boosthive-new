-- Add onboarding_checklist column to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS onboarding_checklist jsonb DEFAULT '[]'::jsonb;
