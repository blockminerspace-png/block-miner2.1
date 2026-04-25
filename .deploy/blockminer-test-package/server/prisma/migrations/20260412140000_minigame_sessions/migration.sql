-- Minigame (Hash Tap Sprint) session tracking
CREATE TABLE "minigame_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "reward_granted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minigame_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "minigame_sessions_user_id_status_idx" ON "minigame_sessions"("user_id", "status");
CREATE INDEX "minigame_sessions_user_id_completed_at_idx" ON "minigame_sessions"("user_id", "completed_at");

ALTER TABLE "minigame_sessions" ADD CONSTRAINT "minigame_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
