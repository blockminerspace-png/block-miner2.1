-- Add missing columns to user_racks that were defined in the Prisma schema
-- but not included in the original 20260410000000_add_user_rooms_and_racks migration.
-- All statements are idempotent (IF NOT EXISTS / exception catch).

-- 1. blocked_by_miner_id — used to track which miner occupies an adjacent slot (2-slot machines)
ALTER TABLE "user_racks" ADD COLUMN IF NOT EXISTS "blocked_by_miner_id" INTEGER;

DO $$ BEGIN
    ALTER TABLE "user_racks" ADD CONSTRAINT "user_racks_blocked_by_miner_id_fkey"
      FOREIGN KEY ("blocked_by_miner_id") REFERENCES "user_miners"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ensure slot_index column exists on user_miners (may have been added via db push on some envs)
ALTER TABLE "user_miners" ADD COLUMN IF NOT EXISTS "slot_index" INTEGER NOT NULL DEFAULT 0;

-- 3. Ensure is_active exists on user_miners
ALTER TABLE "user_miners" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
