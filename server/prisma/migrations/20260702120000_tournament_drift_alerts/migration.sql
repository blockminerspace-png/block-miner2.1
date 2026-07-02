-- Drift alerts for offerwall Engine V2 (detect-only; no auto-correction).
CREATE TABLE "tournament_score_drifts" (
    "id" BIGSERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "action_total" DOUBLE PRECISION,
    "contribution_total" DOUBLE PRECISION,
    "entry_score" DOUBLE PRECISION,
    "delta_actions_contributions" DOUBLE PRECISION,
    "delta_contributions_entry" DOUBLE PRECISION,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_score_drifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tournament_score_drifts_tournament_id_detected_at_idx"
  ON "tournament_score_drifts"("tournament_id", "detected_at");

ALTER TABLE "tournament_score_drifts"
  ADD CONSTRAINT "tournament_score_drifts_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
