-- Reset LP backfill flags so new chains (Optimism, BSC, Avalanche) get scanned.
-- The cron will automatically re-backfill wallets where this is NULL.
UPDATE "transparency_tracked_wallets"
SET "liquidity_pools_backfilled_at" = NULL;
