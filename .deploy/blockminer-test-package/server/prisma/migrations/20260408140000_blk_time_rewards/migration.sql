-- BLK time-based pool rewards (10 min cycles, proportional hashrate)

ALTER TABLE "blk_economy_config" ADD COLUMN IF NOT EXISTS "blk_cycle_reward" DECIMAL(20,8) NOT NULL DEFAULT 0.03;
ALTER TABLE "blk_economy_config" ADD COLUMN IF NOT EXISTS "blk_cycle_interval_sec" INTEGER NOT NULL DEFAULT 600;
ALTER TABLE "blk_economy_config" ADD COLUMN IF NOT EXISTS "blk_cycle_activity_sec" INTEGER NOT NULL DEFAULT 900;
ALTER TABLE "blk_economy_config" ADD COLUMN IF NOT EXISTS "blk_cycle_min_hashrate" DECIMAL(24,8) NOT NULL DEFAULT 0.00000001;
ALTER TABLE "blk_economy_config" ADD COLUMN IF NOT EXISTS "blk_cycle_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "blk_economy_config" ADD COLUMN IF NOT EXISTS "blk_cycle_boost" DECIMAL(10,4) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "blk_reward_cycles" (
    "id" SERIAL NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "total_hashrate" DECIMAL(24,8) NOT NULL,
    "total_reward" DECIMAL(20,8) NOT NULL,
    "distributed" DECIMAL(20,8) NOT NULL,
    "miner_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blk_reward_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "blk_reward_cycles_window_start_key" ON "blk_reward_cycles"("window_start");

CREATE TABLE IF NOT EXISTS "blk_reward_logs" (
    "id" SERIAL NOT NULL,
    "cycle_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "hashrate" DECIMAL(24,8) NOT NULL,
    "share_bps" INTEGER NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blk_reward_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blk_reward_logs_user_id_idx" ON "blk_reward_logs"("user_id");
CREATE INDEX IF NOT EXISTS "blk_reward_logs_cycle_id_idx" ON "blk_reward_logs"("cycle_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blk_reward_logs_cycle_id_fkey'
  ) THEN
    ALTER TABLE "blk_reward_logs" ADD CONSTRAINT "blk_reward_logs_cycle_id_fkey"
      FOREIGN KEY ("cycle_id") REFERENCES "blk_reward_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blk_reward_logs_user_id_fkey'
  ) THEN
    ALTER TABLE "blk_reward_logs" ADD CONSTRAINT "blk_reward_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
