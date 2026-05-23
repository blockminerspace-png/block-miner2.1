CREATE TABLE "daily_power_boosts" (
    "id"         SERIAL          NOT NULL,
    "user_id"    INTEGER         NOT NULL,
    "day_key"    TEXT            NOT NULL,
    "paid_at"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount_pol" DECIMAL(20,8)   NOT NULL,

    CONSTRAINT "daily_power_boosts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_power_boosts_user_id_day_key_key" ON "daily_power_boosts"("user_id", "day_key");
CREATE INDEX "daily_power_boosts_user_id_idx" ON "daily_power_boosts"("user_id");

ALTER TABLE "daily_power_boosts"
    ADD CONSTRAINT "daily_power_boosts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
