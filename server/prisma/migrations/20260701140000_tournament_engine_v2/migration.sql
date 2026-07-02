-- Tournament Engine v2: USD deposits, price snapshots, score contributions, outbox

-- AlterEnum
ALTER TYPE "TournamentMetric" ADD VALUE IF NOT EXISTS 'DEPOSITS_USD';

-- CreateTable asset_price_snapshots
CREATE TABLE IF NOT EXISTS "asset_price_snapshots" (
    "id" SERIAL NOT NULL,
    "asset" TEXT NOT NULL,
    "event_at" TIMESTAMP(3) NOT NULL,
    "price_usd" DECIMAL(20,8) NOT NULL,
    "source" TEXT NOT NULL,
    "source_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "asset_price_snapshots_asset_event_at_key"
    ON "asset_price_snapshots"("asset", "event_at");
CREATE INDEX IF NOT EXISTS "asset_price_snapshots_asset_event_at_idx"
    ON "asset_price_snapshots"("asset", "event_at");

-- AlterTable transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "confirmed_event_at" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "usd_rate_at_confirmation" DECIMAL(20,8);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "usd_value_at_confirmation" DECIMAL(20,8);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "counts_for_tournament" BOOLEAN;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "price_snapshot_id" INTEGER;

CREATE INDEX IF NOT EXISTS "transactions_type_status_confirmed_event_at_idx"
    ON "transactions"("type", "status", "confirmed_event_at");
CREATE INDEX IF NOT EXISTS "transactions_user_id_confirmed_event_at_idx"
    ON "transactions"("user_id", "confirmed_event_at");

DO $$ BEGIN
    ALTER TABLE "transactions"
        ADD CONSTRAINT "transactions_price_snapshot_id_fkey"
        FOREIGN KEY ("price_snapshot_id") REFERENCES "asset_price_snapshots"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable tournaments
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "metric_config" JSONB;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "scores_reconciled_at" TIMESTAMP(3);
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "tournaments_status_metric_idx"
    ON "tournaments"("status", "metric");

-- AlterTable tournament_entries
ALTER TABLE "tournament_entries" ADD COLUMN IF NOT EXISTS "first_contribution_at" TIMESTAMP(3);

-- CreateTable tournament_score_contributions
CREATE TABLE IF NOT EXISTS "tournament_score_contributions" (
    "id" BIGSERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "metric_value" DECIMAL(20,8) NOT NULL,
    "event_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_score_contributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tournament_score_contributions_tournament_id_source_type_source_id_key"
    ON "tournament_score_contributions"("tournament_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "tournament_score_contributions_tournament_id_user_id_idx"
    ON "tournament_score_contributions"("tournament_id", "user_id");
CREATE INDEX IF NOT EXISTS "tournament_score_contributions_tournament_id_event_at_idx"
    ON "tournament_score_contributions"("tournament_id", "event_at");

DO $$ BEGIN
    ALTER TABLE "tournament_score_contributions"
        ADD CONSTRAINT "tournament_score_contributions_tournament_id_fkey"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "tournament_score_contributions"
        ADD CONSTRAINT "tournament_score_contributions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable tournament_domain_outbox
CREATE TABLE IF NOT EXISTS "tournament_domain_outbox" (
    "id" SERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tournament_domain_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tournament_domain_outbox_idempotency_key_key"
    ON "tournament_domain_outbox"("idempotency_key");
CREATE INDEX IF NOT EXISTS "tournament_domain_outbox_status_next_run_at_idx"
    ON "tournament_domain_outbox"("status", "next_run_at");
CREATE INDEX IF NOT EXISTS "tournament_domain_outbox_event_type_idx"
    ON "tournament_domain_outbox"("event_type");
