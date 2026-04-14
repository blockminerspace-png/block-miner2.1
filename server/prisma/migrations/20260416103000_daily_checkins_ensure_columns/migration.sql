-- Prisma model DailyCheckin expects these columns; older DBs may lack them after introspect/db push drift.
ALTER TABLE "daily_checkins" ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT 'wallet';
ALTER TABLE "daily_checkins" ADD COLUMN IF NOT EXISTS "streak" INTEGER NOT NULL DEFAULT 0;
