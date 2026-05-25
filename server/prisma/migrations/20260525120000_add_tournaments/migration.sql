-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TournamentMetric" AS ENUM ('HASHRATE', 'BLOCKS_MINED', 'CHECKINS', 'TASKS_COMPLETED', 'DEPOSITS_POL');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentPrizeType" AS ENUM ('POL', 'BLK', 'MINING_BOOST', 'MACHINE');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TournamentType" NOT NULL,
    "metric" "TournamentMetric" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_prizes" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "rank_from" INTEGER NOT NULL,
    "rank_to" INTEGER NOT NULL,
    "prize_type" "TournamentPrizeType" NOT NULL,
    "pol_amount" DECIMAL(20,8),
    "blk_amount" DECIMAL(20,8),
    "boost_hash_rate" DOUBLE PRECISION,
    "boost_hours" INTEGER,
    "miner_id" INTEGER,
    "miner_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tournament_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_entries" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "reward_granted" BOOLEAN NOT NULL DEFAULT false,
    "reward_granted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournaments_status_starts_at_idx" ON "tournaments"("status", "starts_at");

-- CreateIndex
CREATE INDEX "tournaments_status_ends_at_idx" ON "tournaments"("status", "ends_at");

-- CreateIndex
CREATE INDEX "tournament_prizes_tournament_id_idx" ON "tournament_prizes"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_entries_tournament_id_user_id_key" ON "tournament_entries"("tournament_id", "user_id");

-- CreateIndex
CREATE INDEX "tournament_entries_tournament_id_score_idx" ON "tournament_entries"("tournament_id", "score" DESC);

-- CreateIndex
CREATE INDEX "tournament_entries_user_id_idx" ON "tournament_entries"("user_id");

-- AddForeignKey
ALTER TABLE "tournament_prizes" ADD CONSTRAINT "tournament_prizes_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_prizes" ADD CONSTRAINT "tournament_prizes_miner_id_fkey" FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
