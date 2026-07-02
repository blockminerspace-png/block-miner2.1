import type { TournamentMetric } from "./types.js";

/** Persisted in tournaments.metric_config.engineStats — no full ranking recompute needed. */
export type TournamentEngineStats = {
  participants: number;
  totalActions: number;
  leaderScore: number;
  lastContributionAt: string | null;
  lastReconcileAt: string | null;
  cacheVersion: number;
  lastDriftCheckAt: string | null;
  openDriftAlerts: number;
};

export type DriftDetail = {
  userId: number;
  actionTotal: number;
  contributionTotal: number;
  entryScore: number;
  deltaActionsContributions: number;
  deltaContributionsEntry: number;
};

export type OfferwallDriftReport = {
  tournamentId: number;
  metric: TournamentMetric;
  driftCount: number;
  drifts: DriftDetail[];
  checkedAt: string;
  /** Global totals (sanity check). */
  totals: {
    actions: number;
    contributions: number;
    entries: number;
  };
};

export type ReconcileReport = {
  tournamentId: number;
  driftCount: number;
  /** Deposit tournaments may auto-correct; offerwall never does. */
  corrected: number;
  offerwallDrift?: OfferwallDriftReport;
};

export type ApplyContributionResult = {
  applied: boolean;
  reason: "inserted" | "duplicate" | "skipped";
};

export type InsertTournamentActionResult = {
  payload: import("./events/tournament-action.event.js").TournamentActionPayload | null;
  duplicate: boolean;
};
