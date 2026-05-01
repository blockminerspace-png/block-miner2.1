ALTER TABLE "ip_intelligence_cache"
  ADD COLUMN IF NOT EXISTS "proxy_detected" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "proxy_type" TEXT,
  ADD COLUMN IF NOT EXISTS "proxy_risk_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "proxy_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "proxy_last_seen_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proxy_checked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proxy_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proxy_source" TEXT,
  ADD COLUMN IF NOT EXISTS "proxy_error" TEXT;

CREATE INDEX IF NOT EXISTS "ip_intelligence_cache_proxy_detected_idx" ON "ip_intelligence_cache"("proxy_detected");
CREATE INDEX IF NOT EXISTS "ip_intelligence_cache_proxy_checked_at_idx" ON "ip_intelligence_cache"("proxy_checked_at");
