-- Preferência de recompensa: pol | blk | both
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mining_payout_mode" TEXT NOT NULL DEFAULT 'both';
