ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "long_description" TEXT;
ALTER TABLE "miners" ALTER COLUMN "price" TYPE DECIMAL(20, 8) USING "price"::numeric;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "tier" TEXT NOT NULL DEFAULT 'common';
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "source_type" TEXT NOT NULL DEFAULT 'store';
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "max_per_user" INTEGER;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "stock_total" INTEGER;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "stock_sold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "available_from" TIMESTAMP(3);
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "available_until" TIMESTAMP(3);
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "miners" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "user_owned_machines" ADD COLUMN IF NOT EXISTS "snapshot_slug" TEXT;
ALTER TABLE "user_owned_machines" ADD COLUMN IF NOT EXISTS "snapshot_price" DECIMAL(20, 8);
ALTER TABLE "user_owned_machines" ADD COLUMN IF NOT EXISTS "acquisition_source" TEXT;

CREATE INDEX IF NOT EXISTS "miners_is_active_show_in_shop_idx" ON "miners"("is_active", "show_in_shop");
CREATE INDEX IF NOT EXISTS "miners_is_archived_idx" ON "miners"("is_archived");
CREATE INDEX IF NOT EXISTS "miners_tier_idx" ON "miners"("tier");
CREATE INDEX IF NOT EXISTS "miners_source_type_idx" ON "miners"("source_type");
CREATE INDEX IF NOT EXISTS "miners_price_idx" ON "miners"("price");
CREATE INDEX IF NOT EXISTS "miners_base_hash_rate_idx" ON "miners"("base_hash_rate");
CREATE INDEX IF NOT EXISTS "miners_created_at_idx" ON "miners"("created_at");
CREATE INDEX IF NOT EXISTS "user_owned_machines_miner_id_idx" ON "user_owned_machines"("miner_id");
