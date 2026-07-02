import type {
  ContributionDelta,
  ReconcileReport,
  ScoreBreakdown,
  TournamentMetric,
  TournamentRecord,
  TournamentWindow,
} from "../types.js";
import type { DepositConfirmedPayload } from "../events/deposit-confirmed.event.js";
import type { TournamentActionPayload } from "../events/tournament-action.event.js";

export type ReconcileOpts = {
  userId?: number;
};

export interface MetricScorer {
  readonly metric: TournamentMetric;

  onDepositConfirmed?(
    event: DepositConfirmedPayload,
    tournament: TournamentRecord,
  ): ContributionDelta | null;

  onTournamentAction?(
    event: TournamentActionPayload,
    tournament: TournamentRecord,
  ): ContributionDelta | null;

  reconcile(
    tournament: TournamentRecord,
    window: TournamentWindow,
    opts?: ReconcileOpts,
  ): Promise<Map<number, ScoreBreakdown>>;

  getUserBreakdown?(
    userId: number,
    tournament: TournamentRecord,
    window: TournamentWindow,
  ): Promise<unknown>;

  getAggregateSummary?(
    tournament: TournamentRecord,
    window: TournamentWindow,
  ): Promise<unknown>;
}

export interface ITournamentEngine {
  handleDepositConfirmed(payload: DepositConfirmedPayload): Promise<void>;
  reconcileTournament(tournamentId: number): Promise<ReconcileReport>;
  reconcileAllActive(): Promise<ReconcileReport[]>;
}
