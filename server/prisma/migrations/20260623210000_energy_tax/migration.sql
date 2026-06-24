CREATE TABLE "energy_tax_charges" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "period_day_starts_at" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "rewards_base" DECIMAL(20,8) NOT NULL,
    "rate_percent" DECIMAL(6,4) NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "notes" TEXT,
    "transaction_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "energy_tax_charges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "energy_tax_charges_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "energy_tax_charges_user_id_period_day_starts_at_key"
  ON "energy_tax_charges"("user_id", "period_day_starts_at");
CREATE UNIQUE INDEX "energy_tax_charges_transaction_id_key"
  ON "energy_tax_charges"("transaction_id");
CREATE INDEX "energy_tax_charges_user_id_created_at_idx"
  ON "energy_tax_charges"("user_id", "created_at");
