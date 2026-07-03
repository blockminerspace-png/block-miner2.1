CREATE TABLE "ptp_sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "ad_id" INTEGER NOT NULL,
    "viewer_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'opening',
    "required_seconds" INTEGER NOT NULL,
    "accumulated_ms" INTEGER NOT NULL DEFAULT 0,
    "last_heartbeat_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "ptp_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ptp_sessions_user_id_status_idx" ON "ptp_sessions"("user_id", "status");
CREATE INDEX "ptp_sessions_last_heartbeat_at_idx" ON "ptp_sessions"("last_heartbeat_at");

ALTER TABLE "ptp_sessions" ADD CONSTRAINT "ptp_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ptp_sessions" ADD CONSTRAINT "ptp_sessions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ptp_ads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
