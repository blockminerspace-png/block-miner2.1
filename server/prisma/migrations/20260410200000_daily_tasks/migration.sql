-- Daily tasks: definitions, per-user per-day progress, idempotency ticks

CREATE TABLE "daily_task_definitions" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "target_value" DECIMAL(24,8) NOT NULL,
    "translation_key" TEXT NOT NULL,
    "reward_kind" TEXT NOT NULL,
    "reward_miner_id" INTEGER,
    "reward_event_miner_id" INTEGER,
    "reward_hash_rate" DOUBLE PRECISION,
    "reward_hash_rate_days" INTEGER,
    "reward_blk_amount" DECIMAL(20,8),
    "reward_pol_amount" DECIMAL(20,8),
    "game_slug" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_task_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_task_definitions_slug_key" ON "daily_task_definitions"("slug");

CREATE TABLE "user_daily_task_progress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "task_definition_id" INTEGER NOT NULL,
    "period_key" TEXT NOT NULL,
    "current_value" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "reward_claimed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_daily_task_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_daily_task_progress_user_id_task_definition_id_period_key_key" ON "user_daily_task_progress"("user_id", "task_definition_id", "period_key");
CREATE INDEX "user_daily_task_progress_user_id_period_key_idx" ON "user_daily_task_progress"("user_id", "period_key");

CREATE TABLE "user_daily_task_dedupe_ticks" (
    "id" SERIAL NOT NULL,
    "task_definition_id" INTEGER NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_daily_task_dedupe_ticks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_daily_task_dedupe_ticks_task_definition_id_dedupe_key_key" ON "user_daily_task_dedupe_ticks"("task_definition_id", "dedupe_key");

ALTER TABLE "daily_task_definitions" ADD CONSTRAINT "daily_task_definitions_reward_miner_id_fkey" FOREIGN KEY ("reward_miner_id") REFERENCES "miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_task_definitions" ADD CONSTRAINT "daily_task_definitions_reward_event_miner_id_fkey" FOREIGN KEY ("reward_event_miner_id") REFERENCES "event_miners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_daily_task_progress" ADD CONSTRAINT "user_daily_task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_daily_task_progress" ADD CONSTRAINT "user_daily_task_progress_task_definition_id_fkey" FOREIGN KEY ("task_definition_id") REFERENCES "daily_task_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_daily_task_dedupe_ticks" ADD CONSTRAINT "user_daily_task_dedupe_ticks_task_definition_id_fkey" FOREIGN KEY ("task_definition_id") REFERENCES "daily_task_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "daily_task_definitions" (
    "slug", "task_type", "target_value", "translation_key", "reward_kind",
    "reward_blk_amount", "reward_pol_amount", "reward_hash_rate", "reward_hash_rate_days",
    "game_slug", "sort_order", "is_active", "created_at", "updated_at"
) VALUES
    ('daily-login', 'LOGIN_DAY', 1, 'dailyTasks.tasks.login', 'BLK', 0.01, NULL, NULL, NULL, NULL, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('daily-mine-blk', 'MINE_BLK', 0.05, 'dailyTasks.tasks.mine_blk', 'BLK', 0.02, NULL, NULL, NULL, NULL, 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('daily-play-games', 'PLAY_GAMES', 3, 'dailyTasks.tasks.play_games', 'POL', NULL, 0.01, NULL, NULL, NULL, 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('daily-watch-youtube', 'WATCH_YOUTUBE', 1, 'dailyTasks.tasks.watch_youtube', 'HASHRATE_TEMP', NULL, NULL, 5, 1, NULL, 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
