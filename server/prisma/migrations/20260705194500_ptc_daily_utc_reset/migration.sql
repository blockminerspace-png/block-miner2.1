-- PTC: per-ad availability resets at 00:00 UTC (no rolling 24h cooldown)
ALTER TABLE "ptp_views" ADD COLUMN "last_viewed_utc_date" DATE;

UPDATE "ptp_views"
SET "last_viewed_utc_date" = ("viewed_at" AT TIME ZONE 'UTC')::date
WHERE "last_viewed_utc_date" IS NULL;
