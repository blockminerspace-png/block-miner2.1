-- Replace shortlink GPU reward with a temporary power boost.
-- Creates the shortlink_powers table (5 H/s for 24h) which is summed
-- into each user's base hash rate alongside youtube/game/auto-mining powers.

CREATE TABLE IF NOT EXISTS "shortlink_powers" (
  "id"         SERIAL        PRIMARY KEY,
  "user_id"    INTEGER       NOT NULL REFERENCES "users"("id"),
  "hash_rate"  DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  "claimed_at" TIMESTAMPTZ   NOT NULL,
  "expires_at" TIMESTAMPTZ   NOT NULL,
  "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "shortlink_powers_user_id_idx"  ON "shortlink_powers"("user_id");
CREATE INDEX IF NOT EXISTS "shortlink_powers_expires_at_idx" ON "shortlink_powers"("expires_at");
