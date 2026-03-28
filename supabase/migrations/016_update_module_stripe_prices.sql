-- PROJ-15: Update module Stripe Price IDs with correct per-module prices
UPDATE modules SET stripe_price_id = 'price_1TEy4BBqMa5Vx8VNcidWpuHa' WHERE code = 'seo_analyse';
UPDATE modules SET stripe_price_id = 'price_1TFybZBqMa5Vx8VN94GVznzI' WHERE code = 'ai_visibility';
UPDATE modules SET stripe_price_id = 'price_1TFycqBqMa5Vx8VNWl8Vpo4p' WHERE code = 'ai_performance';
