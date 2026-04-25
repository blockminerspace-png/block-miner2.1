-- Read & Earn partner campaigns and per-user redemption audit rows
CREATE TABLE "read_earn_campaigns" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "partner_url" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "reward_type" TEXT NOT NULL,
    "reward_amount" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "reward_miner_id" INTEGER,
    "hashrate_validity_days" INTEGER NOT NULL DEFAULT 7,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_redemptions" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "read_earn_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "read_earn_campaigns_is_active_starts_at_expires_at_idx" ON "read_earn_campaigns"("is_active", "starts_at", "expires_at");

CREATE TABLE "read_earn_redemptions" (
    "id" SERIAL NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reward_snapshot" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "read_earn_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "read_earn_redemptions_user_id_campaign_id_key" ON "read_earn_redemptions"("user_id", "campaign_id");

CREATE INDEX "read_earn_redemptions_campaign_id_idx" ON "read_earn_redemptions"("campaign_id");

CREATE INDEX "read_earn_redemptions_user_id_idx" ON "read_earn_redemptions"("user_id");

ALTER TABLE "read_earn_campaigns" ADD CONSTRAINT "read_earn_campaigns_reward_miner_id_fkey" FOREIGN KEY ("reward_miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "read_earn_redemptions" ADD CONSTRAINT "read_earn_redemptions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "read_earn_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "read_earn_redemptions" ADD CONSTRAINT "read_earn_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
