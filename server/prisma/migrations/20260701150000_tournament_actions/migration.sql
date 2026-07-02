-- Normalized tournament actions for incremental offerwall/PTC scoring (Engine V2).
CREATE TABLE "tournament_actions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "action_count" INTEGER NOT NULL,
    "executed_at_utc" TIMESTAMP(3) NOT NULL,
    "source_id" TEXT NOT NULL,
    "tournament_eligible" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_actions_provider_source_id_key" ON "tournament_actions"("provider", "source_id");
CREATE INDEX "tournament_actions_user_id_executed_at_utc_idx" ON "tournament_actions"("user_id", "executed_at_utc");
CREATE INDEX "tournament_actions_executed_at_utc_idx" ON "tournament_actions"("executed_at_utc");

ALTER TABLE "tournament_actions" ADD CONSTRAINT "tournament_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
