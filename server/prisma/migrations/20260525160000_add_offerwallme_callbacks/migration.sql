CREATE TABLE "offerwallme_callbacks" (
    "id"          SERIAL PRIMARY KEY,
    "user_id"     INTEGER NOT NULL,
    "trans_id"    TEXT    NOT NULL,
    "offer_name"  TEXT,
    "offer_type"  TEXT,
    "payout_usd"  DOUBLE PRECISION NOT NULL,
    "pol_credited" DOUBLE PRECISION NOT NULL,
    "pol_price"   DOUBLE PRECISION NOT NULL,
    "status"      INTEGER NOT NULL,
    "request_ip"  TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offerwallme_callbacks_trans_id_key" UNIQUE ("trans_id"),
    CONSTRAINT "offerwallme_callbacks_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "offerwallme_callbacks_user_id_idx"  ON "offerwallme_callbacks"("user_id");
CREATE INDEX "offerwallme_callbacks_created_at_idx" ON "offerwallme_callbacks"("created_at");
