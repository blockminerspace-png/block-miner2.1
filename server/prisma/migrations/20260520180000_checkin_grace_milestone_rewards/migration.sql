-- Check-in grace/freeze flags and extended milestone reward fields (additive)
ALTER TABLE "daily_checkins" ADD COLUMN IF NOT EXISTS "used_grace" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "daily_checkins" ADD COLUMN IF NOT EXISTS "used_freeze" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "checkin_streak_milestones" ADD COLUMN IF NOT EXISTS "miner_id" INTEGER;
ALTER TABLE "checkin_streak_milestones" ADD COLUMN IF NOT EXISTS "item_code" TEXT;
ALTER TABLE "checkin_streak_milestones" ADD COLUMN IF NOT EXISTS "metadata_json" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkin_streak_milestones_miner_id_fkey'
  ) THEN
    ALTER TABLE "checkin_streak_milestones"
      ADD CONSTRAINT "checkin_streak_milestones_miner_id_fkey"
      FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
