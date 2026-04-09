-- Auto Mining GPU v2: session-based grants, turbo banner impressions, daily UTC cap (applied in app layer).

CREATE TABLE "auto_mining_v2_sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "next_claim_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_mining_v2_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_mining_v2_power_grants" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_id" TEXT NOT NULL,
    "hash_rate" DOUBLE PRECISION NOT NULL,
    "mode" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_mining_v2_power_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_mining_v2_banner_impressions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_id" TEXT NOT NULL,
    "banner_key" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clicked_at" TIMESTAMP(3),
    "grant_id" INTEGER,

    CONSTRAINT "auto_mining_v2_banner_impressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auto_mining_v2_banner_impressions_grant_id_key" ON "auto_mining_v2_banner_impressions"("grant_id");

CREATE INDEX "auto_mining_v2_sessions_user_id_is_active_idx" ON "auto_mining_v2_sessions"("user_id", "is_active");

CREATE INDEX "auto_mining_v2_power_grants_user_id_earned_at_idx" ON "auto_mining_v2_power_grants"("user_id", "earned_at");

CREATE INDEX "auto_mining_v2_power_grants_user_id_expires_at_idx" ON "auto_mining_v2_power_grants"("user_id", "expires_at");

CREATE INDEX "auto_mining_v2_banner_impressions_user_id_session_id_idx" ON "auto_mining_v2_banner_impressions"("user_id", "session_id");

ALTER TABLE "auto_mining_v2_sessions" ADD CONSTRAINT "auto_mining_v2_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_mining_v2_power_grants" ADD CONSTRAINT "auto_mining_v2_power_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_mining_v2_power_grants" ADD CONSTRAINT "auto_mining_v2_power_grants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auto_mining_v2_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_mining_v2_banner_impressions" ADD CONSTRAINT "auto_mining_v2_banner_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_mining_v2_banner_impressions" ADD CONSTRAINT "auto_mining_v2_banner_impressions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auto_mining_v2_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_mining_v2_banner_impressions" ADD CONSTRAINT "auto_mining_v2_banner_impressions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "auto_mining_v2_power_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
