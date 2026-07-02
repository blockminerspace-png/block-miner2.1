export type TournamentMetric =
  | "HASHRATE"
  | "BLOCKS_MINED"
  | "CHECKINS"
  | "TASKS_COMPLETED"
  | "DEPOSITS_POL"
  | "DEPOSITS_USD"
  | "OFFERS_INTERNAL"
  | "OFFERS_EXTERNAL"
  | "OFFERS_ALL";

export type TournamentStatus = "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";

export type TournamentWindow = {
  startsAt: Date;
  endsAt: Date;
};

export function windowContains(window: TournamentWindow, eventAt: Date, upperBound?: Date): boolean {
  const upper = upperBound && upperBound < window.endsAt ? upperBound : window.endsAt;
  return eventAt >= window.startsAt && eventAt <= upper;
}

export type TournamentRecord = {
  id: number;
  name: string;
  metric: TournamentMetric;
  startsAt: Date;
  endsAt: Date;
  status: TournamentStatus;
};

export type ContributionDelta = {
  userId: number;
  sourceType: string;
  sourceId: string;
  metricValue: number;
  eventAt: Date;
  metadata?: Record<string, unknown>;
};

export type ScoreBreakdown = {
  total: number;
  txCount: number;
  /** Informational POL total (deposit tournaments). */
  totalPol?: number;
  /** Informational USD total when persisted (legacy POL metric). */
  totalUsd?: number;
};

export type { ReconcileReport, OfferwallDriftReport, DriftDetail } from "./tournament-engine.types.js";
