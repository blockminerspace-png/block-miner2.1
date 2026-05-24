-- Force re-backfill after fixing the Etherscan contractaddress filter.
-- Without this, wallets backfilled with the old code (which missed positions)
-- would not be re-scanned since liquidityPoolsBackfilledAt is already set.
UPDATE "transparency_tracked_wallets"
SET "liquidity_pools_backfilled_at" = NULL;
