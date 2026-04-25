-- BLK is not withdrawable; remove saque-related config columns (legacy rows may still exist in transactions)

ALTER TABLE "blk_economy_config" DROP COLUMN IF EXISTS "min_withdraw_blk";
ALTER TABLE "blk_economy_config" DROP COLUMN IF EXISTS "daily_withdraw_limit_blk";
