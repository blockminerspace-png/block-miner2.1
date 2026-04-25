CREATE TABLE IF NOT EXISTS "ip_intelligence_cache" (
  "id" SERIAL PRIMARY KEY,
  "ip" TEXT NOT NULL,
  "ip_version" INTEGER NOT NULL,
  "reverse_dns" TEXT,
  "reverse_dns_forward_confirmed" BOOLEAN,
  "asn" INTEGER,
  "asn_org" TEXT,
  "network_cidr" TEXT,
  "provider_label" TEXT,
  "provider_type" TEXT NOT NULL DEFAULT 'unknown',
  "confidence" TEXT NOT NULL DEFAULT 'low',
  "source" TEXT,
  "error" TEXT,
  "checked_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ip_intelligence_cache_ip_key" ON "ip_intelligence_cache"("ip");
CREATE INDEX IF NOT EXISTS "ip_intelligence_cache_ip_idx" ON "ip_intelligence_cache"("ip");
CREATE INDEX IF NOT EXISTS "ip_intelligence_cache_asn_idx" ON "ip_intelligence_cache"("asn");
CREATE INDEX IF NOT EXISTS "ip_intelligence_cache_provider_type_idx" ON "ip_intelligence_cache"("provider_type");
CREATE INDEX IF NOT EXISTS "ip_intelligence_cache_expires_at_idx" ON "ip_intelligence_cache"("expires_at");

CREATE INDEX IF NOT EXISTS "users_registration_ip_idx" ON "users"("registration_ip");
CREATE INDEX IF NOT EXISTS "users_last_ip_idx" ON "users"("last_ip");
CREATE INDEX IF NOT EXISTS "users_wallet_address_idx" ON "users"("wallet_address");
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users"("created_at");
CREATE INDEX IF NOT EXISTS "users_last_login_at_idx" ON "users"("last_login_at");
