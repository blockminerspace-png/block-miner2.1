-- Remove all legacy/closed LP positions — system now only tracks active ones.
DELETE FROM "transparency_liquidity_pool_positions"
WHERE "status" != 'active';

-- Also clear backfill flag (no longer used, safe to keep NULL).
UPDATE "transparency_tracked_wallets"
SET "liquidity_pools_backfilled_at" = NULL;
