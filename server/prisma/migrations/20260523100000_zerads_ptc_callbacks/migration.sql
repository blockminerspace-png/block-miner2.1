-- Create zerads PTC callback log table for history and idempotency
CREATE TABLE IF NOT EXISTS "zerads_ptc_callbacks" (
  "id"            SERIAL PRIMARY KEY,
  "user_id"       INTEGER NOT NULL,
  "username"      TEXT NOT NULL,
  "amount_zer"    DOUBLE PRECISION NOT NULL,
  "exchange_rate" DOUBLE PRECISION NOT NULL,
  "payout_amount" DOUBLE PRECISION NOT NULL,
  "clicks"        INTEGER NOT NULL DEFAULT 0,
  "request_ip"    TEXT,
  "callback_hash" TEXT NOT NULL,
  "callback_at"   TIMESTAMPTZ NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zerads_ptc_callbacks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "zerads_ptc_callbacks_callback_hash_key"
  ON "zerads_ptc_callbacks"("callback_hash");

CREATE INDEX IF NOT EXISTS "zerads_ptc_callbacks_user_id_idx"
  ON "zerads_ptc_callbacks"("user_id");

CREATE INDEX IF NOT EXISTS "zerads_ptc_callbacks_created_at_idx"
  ON "zerads_ptc_callbacks"("created_at");
