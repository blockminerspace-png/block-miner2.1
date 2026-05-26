CREATE TABLE ptc_ad_tiers (
  id SERIAL PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  price_per_view_shib DECIMAL(30, 8) NOT NULL DEFAULT 0,
  reward_per_view_shib DECIMAL(30, 8) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE ptp_ads ADD COLUMN tier_id INTEGER REFERENCES ptc_ad_tiers(id);
