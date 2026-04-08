-- PROJ-50: Extend customer_integrations for GA4 OAuth connections

ALTER TABLE customer_integrations
  DROP CONSTRAINT IF EXISTS customer_integrations_integration_type_check;

ALTER TABLE customer_integrations
  DROP CONSTRAINT IF EXISTS customer_integrations_status_check;

ALTER TABLE customer_integrations
  ADD CONSTRAINT customer_integrations_integration_type_check
  CHECK (integration_type IN ('google_ads', 'meta_pixel', 'openai', 'gsc', 'ga4'));

ALTER TABLE customer_integrations
  ADD CONSTRAINT customer_integrations_status_check
  CHECK (status IN ('connected', 'active', 'disconnected', 'token_expired'));
