-- Traffic attribution fields on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "utm_source"      VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "utm_medium"      VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "utm_campaign"    VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referrer_domain" VARCHAR(255);

-- Page views table
CREATE TABLE IF NOT EXISTS "page_views" (
  "id"              SERIAL PRIMARY KEY,
  "path"            VARCHAR(500) NOT NULL DEFAULT '/',
  "referrer_domain" VARCHAR(255),
  "utm_source"      VARCHAR(255),
  "utm_medium"      VARCHAR(255),
  "utm_campaign"    VARCHAR(255),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "page_views_created_at_idx"      ON "page_views"("created_at");
CREATE INDEX IF NOT EXISTS "page_views_referrer_domain_idx" ON "page_views"("referrer_domain");
CREATE INDEX IF NOT EXISTS "page_views_utm_source_idx"      ON "page_views"("utm_source");
