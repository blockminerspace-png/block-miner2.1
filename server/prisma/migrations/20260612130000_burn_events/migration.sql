-- BurnEvent
CREATE TABLE "burn_events" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "image_url" TEXT,
  "required_hash_rate" DOUBLE PRECISION NOT NULL,
  "reward_miner_id" INTEGER NOT NULL,
  "claim_limit_per_user" INTEGER NOT NULL DEFAULT 1,
  "stock_total" INTEGER,
  "stock_claimed" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "burn_events_reward_miner_id_fkey" FOREIGN KEY ("reward_miner_id") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "burn_events_is_active_deleted_at_idx" ON "burn_events"("is_active", "deleted_at");

-- BurnClaim
CREATE TABLE "burn_claims" (
  "id" SERIAL PRIMARY KEY,
  "event_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "total_hash_rate" DOUBLE PRECISION NOT NULL,
  "burned_machines_json" JSONB NOT NULL,
  "reward_miner_name" TEXT NOT NULL,
  "reward_inbox_id" INTEGER,
  "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "burn_claims_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "burn_events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "burn_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "burn_claims_event_id_user_id_idx" ON "burn_claims"("event_id", "user_id");
CREATE INDEX "burn_claims_user_id_idx" ON "burn_claims"("user_id");
