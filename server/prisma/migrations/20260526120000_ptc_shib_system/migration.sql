-- Add shib_balance to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "shib_balance" DECIMAL(30,8) NOT NULL DEFAULT 0;

-- PTC settings singleton
CREATE TABLE IF NOT EXISTS "ptc_settings" (
  "id"                    INTEGER PRIMARY KEY DEFAULT 1,
  "price_per_view_shib"   DECIMAL(30,8) NOT NULL DEFAULT 0,
  "reward_per_view_shib"  DECIMAL(30,8) NOT NULL DEFAULT 0,
  "min_duration_seconds"  INTEGER NOT NULL DEFAULT 10,
  "max_duration_seconds"  INTEGER NOT NULL DEFAULT 60,
  "min_views"             INTEGER NOT NULL DEFAULT 100,
  "max_views"             INTEGER NOT NULL DEFAULT 1000000,
  "is_enabled"            BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "ptc_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

-- Extend ptp_ads for PTC system
ALTER TABLE "ptp_ads" ADD COLUMN IF NOT EXISTS "description"          TEXT NOT NULL DEFAULT '';
ALTER TABLE "ptp_ads" ADD COLUMN IF NOT EXISTS "ad_type"              TEXT NOT NULL DEFAULT 'window';
ALTER TABLE "ptp_ads" ADD COLUMN IF NOT EXISTS "duration_seconds"     INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "ptp_ads" ADD COLUMN IF NOT EXISTS "status"               TEXT NOT NULL DEFAULT 'pending_approval';
ALTER TABLE "ptp_ads" ADD COLUMN IF NOT EXISTS "rejection_reason"     TEXT;
ALTER TABLE "ptp_ads" ADD COLUMN IF NOT EXISTS "cost_shib"            DECIMAL(30,8) NOT NULL DEFAULT 0;
ALTER TABLE "ptp_ads" ADD COLUMN IF NOT EXISTS "reward_per_view_shib" DECIMAL(30,8) NOT NULL DEFAULT 0;

-- Extend ptp_views for earned shib tracking
ALTER TABLE "ptp_views" ADD COLUMN IF NOT EXISTS "earned_shib" DECIMAL(30,8) NOT NULL DEFAULT 0;

-- Extend ptp_earnings: add amount_shib (keep amount_usd for legacy rows)
ALTER TABLE "ptp_earnings" ADD COLUMN IF NOT EXISTS "amount_shib" DECIMAL(30,8) NOT NULL DEFAULT 0;
