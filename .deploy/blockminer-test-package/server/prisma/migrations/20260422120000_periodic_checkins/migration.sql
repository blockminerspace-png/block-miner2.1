-- Weekly / monthly on-chain check-ins (daily remains in daily_checkins)
CREATE TABLE "periodic_checkins" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "cadence" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "tx_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "chain_id" INTEGER NOT NULL,

    CONSTRAINT "periodic_checkins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "periodic_checkins_tx_hash_key" ON "periodic_checkins"("tx_hash");

CREATE UNIQUE INDEX "periodic_checkins_user_id_cadence_period_key_key" ON "periodic_checkins"("user_id", "cadence", "period_key");

CREATE INDEX "periodic_checkins_status_created_at_idx" ON "periodic_checkins"("status", "created_at");

ALTER TABLE "periodic_checkins" ADD CONSTRAINT "periodic_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
