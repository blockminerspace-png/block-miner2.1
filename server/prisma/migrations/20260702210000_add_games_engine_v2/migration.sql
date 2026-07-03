-- CreateTable
CREATE TABLE "game_cooldown_states" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "game_slug" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "last_finished_at" TIMESTAMP(3),
    "cooldown_ends_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_cooldown_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_session_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "game_slug" TEXT NOT NULL,
    "game_id" INTEGER,
    "success" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "play_time_ms" INTEGER NOT NULL DEFAULT 0,
    "fail_reason" TEXT,
    "trust_score" INTEGER,
    "reward_granted" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_cooldown_states_user_id_idx" ON "game_cooldown_states"("user_id");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "game_cooldown_states_user_id_game_slug_key" ON "game_cooldown_states"("user_id", "game_slug");

-- CreateIndex
CREATE INDEX "game_session_logs_user_id_created_at_idx" ON "game_session_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "game_session_logs_game_slug_created_at_idx" ON "game_session_logs"("game_slug", "created_at");

-- AddForeignKey
ALTER TABLE "game_cooldown_states" ADD CONSTRAINT "game_cooldown_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_session_logs" ADD CONSTRAINT "game_session_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
