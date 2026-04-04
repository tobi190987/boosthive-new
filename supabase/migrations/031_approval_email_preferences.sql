ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_on_approval_decision BOOLEAN NOT NULL DEFAULT false;
