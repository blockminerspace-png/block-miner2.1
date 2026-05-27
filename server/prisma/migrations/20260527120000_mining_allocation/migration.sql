-- Add per-user hashrate allocation between POL and SHIB pools (basis points; 10000 = 100% POL).
ALTER TABLE "users"
  ADD COLUMN "mining_allocation_pol_bps" INTEGER NOT NULL DEFAULT 10000;

-- Extend mining rewards log with SHIB pool fields (back-filled to 0 for historical rows).
ALTER TABLE "mining_rewards_log"
  ADD COLUMN "reward_amount_shib" DECIMAL(30, 8) NOT NULL DEFAULT 0,
  ADD COLUMN "share_shib_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "work_pol" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "work_shib" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Extend referral earnings with SHIB commission column.
ALTER TABLE "referral_earnings"
  ADD COLUMN "amount_shib" DECIMAL(30, 8) NOT NULL DEFAULT 0;

-- Extend block-level distribution records with SHIB pool stats.
ALTER TABLE "block_distributions"
  ADD COLUMN "reward_shib" DECIMAL(30, 8) NOT NULL DEFAULT 0,
  ADD COLUMN "total_work_shib" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Extend per-miner block rewards with SHIB amount + per-pool work split.
ALTER TABLE "block_miner_rewards"
  ADD COLUMN "reward_amount_shib" DECIMAL(30, 8) NOT NULL DEFAULT 0,
  ADD COLUMN "work_pol" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "work_shib" DOUBLE PRECISION NOT NULL DEFAULT 0;
