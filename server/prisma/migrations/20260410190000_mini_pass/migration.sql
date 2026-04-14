-- Mini Pass: seasons, missions, XP ledger, claims, purchases (additive only)

CREATE TABLE "mini_pass_seasons" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title_i18n" JSONB NOT NULL,
    "subtitle_i18n" JSONB,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "max_level" INTEGER NOT NULL,
    "xp_per_level" INTEGER NOT NULL,
    "buy_level_price_pol" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "complete_pass_price_pol" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "banner_image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mini_pass_seasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mini_pass_seasons_slug_key" ON "mini_pass_seasons"("slug");
CREATE INDEX "mini_pass_seasons_starts_at_ends_at_idx" ON "mini_pass_seasons"("starts_at", "ends_at");
CREATE INDEX "mini_pass_seasons_is_active_deleted_at_idx" ON "mini_pass_seasons"("is_active", "deleted_at");

CREATE TABLE "mini_pass_level_rewards" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "reward_kind" TEXT NOT NULL,
    "miner_id" INTEGER,
    "event_miner_id" INTEGER,
    "hash_rate" DOUBLE PRECISION,
    "hash_rate_days" INTEGER,
    "blk_amount" DECIMAL(20,8),
    "pol_amount" DECIMAL(20,8),
    "title_i18n" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mini_pass_level_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mini_pass_level_rewards_season_id_level_key" ON "mini_pass_level_rewards"("season_id", "level");
CREATE INDEX "mini_pass_level_rewards_season_id_idx" ON "mini_pass_level_rewards"("season_id");

CREATE TABLE "mini_pass_missions" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "cadence" TEXT NOT NULL,
    "mission_type" TEXT NOT NULL,
    "target_value" DECIMAL(24,8) NOT NULL,
    "xp_reward" INTEGER NOT NULL,
    "title_i18n" JSONB NOT NULL,
    "description_i18n" JSONB,
    "game_slug" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mini_pass_missions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mini_pass_missions_season_id_idx" ON "mini_pass_missions"("season_id");

CREATE TABLE "user_mini_pass_enrollments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mini_pass_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mini_pass_enrollments_user_id_season_id_key" ON "user_mini_pass_enrollments"("user_id", "season_id");
CREATE INDEX "user_mini_pass_enrollments_season_id_idx" ON "user_mini_pass_enrollments"("season_id");

CREATE TABLE "user_mini_pass_xp_ledger" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "mission_id" INTEGER,
    "period_key" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mini_pass_xp_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mini_pass_xp_ledger_idempotency_key_key" ON "user_mini_pass_xp_ledger"("idempotency_key");
CREATE INDEX "user_mini_pass_xp_ledger_user_id_season_id_idx" ON "user_mini_pass_xp_ledger"("user_id", "season_id");

CREATE TABLE "user_mini_pass_mission_progress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "mission_id" INTEGER NOT NULL,
    "period_key" TEXT NOT NULL,
    "current_value" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "user_mini_pass_mission_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mini_pass_mission_progress_user_id_mission_id_period_key_key" ON "user_mini_pass_mission_progress"("user_id", "mission_id", "period_key");
CREATE INDEX "user_mini_pass_mission_progress_user_id_mission_id_idx" ON "user_mini_pass_mission_progress"("user_id", "mission_id");

CREATE TABLE "user_mini_pass_reward_claims" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "level_reward_id" INTEGER NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mini_pass_reward_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mini_pass_reward_claims_user_id_level_reward_id_key" ON "user_mini_pass_reward_claims"("user_id", "level_reward_id");
CREATE INDEX "user_mini_pass_reward_claims_user_id_idx" ON "user_mini_pass_reward_claims"("user_id");

CREATE TABLE "user_mini_pass_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "levels_added" INTEGER NOT NULL DEFAULT 0,
    "xp_added" INTEGER NOT NULL DEFAULT 0,
    "price_paid" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'POL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mini_pass_purchases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_mini_pass_purchases_user_id_season_id_idx" ON "user_mini_pass_purchases"("user_id", "season_id");

ALTER TABLE "mini_pass_level_rewards" ADD CONSTRAINT "mini_pass_level_rewards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "mini_pass_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mini_pass_level_rewards" ADD CONSTRAINT "mini_pass_level_rewards_miner_id_fkey" FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mini_pass_level_rewards" ADD CONSTRAINT "mini_pass_level_rewards_event_miner_id_fkey" FOREIGN KEY ("event_miner_id") REFERENCES "event_miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mini_pass_missions" ADD CONSTRAINT "mini_pass_missions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "mini_pass_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_mini_pass_enrollments" ADD CONSTRAINT "user_mini_pass_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_mini_pass_enrollments" ADD CONSTRAINT "user_mini_pass_enrollments_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "mini_pass_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_mini_pass_xp_ledger" ADD CONSTRAINT "user_mini_pass_xp_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_mini_pass_xp_ledger" ADD CONSTRAINT "user_mini_pass_xp_ledger_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "mini_pass_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_mini_pass_xp_ledger" ADD CONSTRAINT "user_mini_pass_xp_ledger_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mini_pass_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_mini_pass_mission_progress" ADD CONSTRAINT "user_mini_pass_mission_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_mini_pass_mission_progress" ADD CONSTRAINT "user_mini_pass_mission_progress_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mini_pass_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_mini_pass_reward_claims" ADD CONSTRAINT "user_mini_pass_reward_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_mini_pass_reward_claims" ADD CONSTRAINT "user_mini_pass_reward_claims_level_reward_id_fkey" FOREIGN KEY ("level_reward_id") REFERENCES "mini_pass_level_rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_mini_pass_purchases" ADD CONSTRAINT "user_mini_pass_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_mini_pass_purchases" ADD CONSTRAINT "user_mini_pass_purchases_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "mini_pass_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_mini_pass_mission_dedupe_ticks" (
    "id" SERIAL NOT NULL,
    "mission_id" INTEGER NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mini_pass_mission_dedupe_ticks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mini_pass_mission_dedupe_ticks_mission_id_dedupe_key_key" ON "user_mini_pass_mission_dedupe_ticks"("mission_id", "dedupe_key");
CREATE INDEX "user_mini_pass_mission_dedupe_ticks_mission_id_idx" ON "user_mini_pass_mission_dedupe_ticks"("mission_id");

ALTER TABLE "user_mini_pass_mission_dedupe_ticks" ADD CONSTRAINT "user_mini_pass_mission_dedupe_ticks_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mini_pass_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
