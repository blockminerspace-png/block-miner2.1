-- Drop legacy Hash Tap Sprint session table (replaced by Chain 2048).
DROP TABLE IF EXISTS "minigame_sessions";

CREATE TABLE "game2048_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "board" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "reward_granted" BOOLEAN NOT NULL DEFAULT false,
    "ended_at" TIMESTAMP(3),
    "reward_claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game2048_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "game2048_sessions_user_id_status_idx" ON "game2048_sessions"("user_id", "status");
CREATE INDEX "game2048_sessions_user_id_reward_claimed_at_idx" ON "game2048_sessions"("user_id", "reward_claimed_at");

ALTER TABLE "game2048_sessions" ADD CONSTRAINT "game2048_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
