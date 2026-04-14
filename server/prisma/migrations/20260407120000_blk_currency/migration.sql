-- BLK internal USD-pegged currency (1 BLK = 1 USD target peg)

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blk_balance" DECIMAL(20,8) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blk_locked" DECIMAL(20,8) NOT NULL DEFAULT 0;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "fee" DECIMAL(20,8);

CREATE TABLE IF NOT EXISTS "blk_economy_config" (
    "id" INTEGER NOT NULL,
    "pol_per_blk" DECIMAL(20,8) NOT NULL,
    "convert_fee_bps" INTEGER NOT NULL DEFAULT 500,
    "min_convert_pol" DECIMAL(20,8) NOT NULL,
    "daily_convert_limit_blk" DECIMAL(20,8),
    "convert_cooldown_sec" INTEGER NOT NULL DEFAULT 300,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blk_economy_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "blk_economy_config" (
    "id",
    "pol_per_blk",
    "convert_fee_bps",
    "min_convert_pol",
    "daily_convert_limit_blk",
    "convert_cooldown_sec",
    "updated_at"
)
SELECT 1, 100, 500, 50, NULL, 300, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "blk_economy_config" WHERE "id" = 1);
