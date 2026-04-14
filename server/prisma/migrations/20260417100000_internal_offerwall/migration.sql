-- Internal offerwall: offers, user attempts, optional link from daily task definitions

CREATE TABLE "internal_offerwall_offers" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "iframe_url" TEXT,
    "min_view_seconds" INTEGER NOT NULL DEFAULT 10,
    "reward_kind" TEXT NOT NULL,
    "reward_blk_amount" DECIMAL(20,8),
    "reward_pol_amount" DECIMAL(20,8),
    "reward_hash_rate" DOUBLE PRECISION,
    "reward_hash_rate_days" INTEGER,
    "daily_limit_per_user" INTEGER NOT NULL DEFAULT 3,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "completion_mode" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_offerwall_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_offerwall_attempts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "offer_id" INTEGER NOT NULL,
    "period_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "reward_granted_at" TIMESTAMP(3),
    "audit_snapshot" TEXT,
    "admin_note" TEXT,

    CONSTRAINT "internal_offerwall_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "internal_offerwall_attempts_user_id_offer_id_period_key_idx" ON "internal_offerwall_attempts"("user_id", "offer_id", "period_key");
CREATE INDEX "internal_offerwall_attempts_offer_id_status_idx" ON "internal_offerwall_attempts"("offer_id", "status");

ALTER TABLE "internal_offerwall_attempts" ADD CONSTRAINT "internal_offerwall_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_offerwall_attempts" ADD CONSTRAINT "internal_offerwall_attempts_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "internal_offerwall_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "daily_task_definitions" ADD COLUMN "internal_offerwall_offer_id" INTEGER;

ALTER TABLE "daily_task_definitions" ADD CONSTRAINT "daily_task_definitions_internal_offerwall_offer_id_fkey" FOREIGN KEY ("internal_offerwall_offer_id") REFERENCES "internal_offerwall_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
