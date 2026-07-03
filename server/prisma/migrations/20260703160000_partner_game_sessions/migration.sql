-- Partner game slugs + play sessions with heartbeat rewards

ALTER TABLE "partner_games" ADD COLUMN "slug" TEXT;

UPDATE "partner_games"
SET "slug" = LOWER(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(REGEXP_REPLACE(COALESCE("title", 'game'), '[^a-zA-Z0-9]+', '-', 'g'), '-+', '-', 'g'))
)
WHERE "slug" IS NULL;

UPDATE "partner_games" pg
SET "slug" = pg."slug" || '-' || pg."id"::text
WHERE pg."id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "id") AS rn
    FROM "partner_games"
  ) d WHERE d.rn > 1
);

ALTER TABLE "partner_games" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "partner_games_slug_key" ON "partner_games"("slug");

CREATE TABLE "partner_game_sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "partner_game_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "accumulated_ms" INTEGER NOT NULL DEFAULT 0,
    "reward_cycle_ms" INTEGER NOT NULL DEFAULT 0,
    "total_hash_granted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grants_count" INTEGER NOT NULL DEFAULT 0,
    "last_heartbeat_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "partner_game_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_game_session_events" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "partner_game_id" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_game_session_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partner_game_sessions_user_id_status_idx" ON "partner_game_sessions"("user_id", "status");
CREATE INDEX "partner_game_sessions_partner_game_id_idx" ON "partner_game_sessions"("partner_game_id");
CREATE INDEX "partner_game_sessions_last_heartbeat_at_idx" ON "partner_game_sessions"("last_heartbeat_at");
CREATE INDEX "partner_game_session_events_session_id_idx" ON "partner_game_session_events"("session_id");
CREATE INDEX "partner_game_session_events_partner_game_id_created_at_idx" ON "partner_game_session_events"("partner_game_id", "created_at");
CREATE INDEX "partner_game_session_events_user_id_created_at_idx" ON "partner_game_session_events"("user_id", "created_at");

ALTER TABLE "partner_game_sessions" ADD CONSTRAINT "partner_game_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partner_game_sessions" ADD CONSTRAINT "partner_game_sessions_partner_game_id_fkey" FOREIGN KEY ("partner_game_id") REFERENCES "partner_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partner_game_session_events" ADD CONSTRAINT "partner_game_session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "partner_game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
