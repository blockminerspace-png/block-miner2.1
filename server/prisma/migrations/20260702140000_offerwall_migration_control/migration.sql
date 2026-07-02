-- Offerwall Engine V2 migration control (separate from tournaments.metric_config).

CREATE TABLE "tournament_offerwall_migration_global" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "global_backfill_at" TIMESTAMP(3),
    "global_backfill_actions" INTEGER NOT NULL DEFAULT 0,
    "global_backfill_skipped" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_offerwall_migration_global_pkey" PRIMARY KEY ("id")
);

INSERT INTO "tournament_offerwall_migration_global" ("id", "updated_at")
VALUES (1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "tournament_offerwall_migrations" (
    "tournament_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "baseline_checksum" TEXT,
    "verified_participants" INTEGER,
    "verified_leader_score" DOUBLE PRECISION,
    "sealed_at" TIMESTAMP(3),
    "shadow_validation_ends_at" TIMESTAMP(3),
    "last_shadow_check_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_offerwall_migrations_pkey" PRIMARY KEY ("tournament_id")
);

ALTER TABLE "tournament_offerwall_migrations"
  ADD CONSTRAINT "tournament_offerwall_migrations_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tournament_shadow_validation_alerts" (
    "id" BIGSERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "legacy_score" DOUBLE PRECISION NOT NULL,
    "ledger_score" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_shadow_validation_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tournament_shadow_validation_alerts_tournament_id_detected_at_idx"
  ON "tournament_shadow_validation_alerts"("tournament_id", "detected_at");

ALTER TABLE "tournament_shadow_validation_alerts"
  ADD CONSTRAINT "tournament_shadow_validation_alerts_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
