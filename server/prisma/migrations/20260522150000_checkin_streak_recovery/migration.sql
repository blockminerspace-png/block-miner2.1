CREATE TABLE "checkin_streak_recoveries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "recovered_streak" INTEGER NOT NULL,
    "missed_days" INTEGER NOT NULL,
    "fee_pol_paid" DOUBLE PRECISION NOT NULL,
    "recovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_streak_recoveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checkin_streak_recoveries_user_id_idx" ON "checkin_streak_recoveries"("user_id");

ALTER TABLE "checkin_streak_recoveries" ADD CONSTRAINT "checkin_streak_recoveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
