import type { DepositConfirmedPayload } from "../domain/events/deposit-confirmed.event.js";
import type { TournamentActionPayload } from "../domain/events/tournament-action.event.js";
import { getMetricScorer } from "../domain/metrics/metric-scorer.registry.js";
import type { ReconcileReport, TournamentMetric } from "../domain/types.js";
import { OFFERS_INCREMENTAL_METRICS, MINIGAME_INCREMENTAL_METRICS } from "../domain/tournament-action.providers.js";
import { isTournamentIncrementalScoringEnabled } from "../config/feature-flags.js";
import { applyContribution } from "./score-projection.service.js";
import { detectOfferwallDrift } from "./offerwall-drift.service.js";
import { isOfferwallIncrementalMetric, isMinigameIncrementalMetric } from "./tournament-engine-metrics.service.js";
import {
  batchUpsertEntriesFromReconcile,
  findActiveTournaments,
  findActiveTournamentsByMetrics,
  findTournamentById,
  getEntryScores,
  touchScoresReconciledAt,
} from "../infrastructure/repositories/tournament.repository.js";
import { computeScoresForTournament } from "../tournaments.service.js";
import _prisma from "../../../src/db/prisma.js";
import loggerLib from "../../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("TournamentEngine");

const DRIFT_TOLERANCE = 0.0001;
const DEPOSIT_INCREMENTAL_METRICS: TournamentMetric[] = ["DEPOSITS_USD", "DEPOSITS_POL"];
const INCREMENTAL_METRICS: TournamentMetric[] = [
  ...DEPOSIT_INCREMENTAL_METRICS,
  ...OFFERS_INCREMENTAL_METRICS,
  ...MINIGAME_INCREMENTAL_METRICS,
];

export async function handleDepositConfirmed(payload: DepositConfirmedPayload): Promise<void> {
  if (!isTournamentIncrementalScoringEnabled()) return;

  const tournaments = await findActiveTournamentsByMetrics(DEPOSIT_INCREMENTAL_METRICS);
  for (const tournament of tournaments) {
    const scorer = getMetricScorer(tournament.metric);
    if (!scorer?.onDepositConfirmed) continue;
    const delta = scorer.onDepositConfirmed(payload, tournament);
    if (!delta) continue;
    await applyContribution(tournament.id, delta);
  }
}

export async function handleTournamentAction(payload: TournamentActionPayload): Promise<void> {
  if (!isTournamentIncrementalScoringEnabled()) return;

  const tournaments = await findActiveTournamentsByMetrics([
    ...OFFERS_INCREMENTAL_METRICS,
    ...MINIGAME_INCREMENTAL_METRICS,
  ]);
  for (const tournament of tournaments) {
    const scorer = getMetricScorer(tournament.metric);
    if (!scorer?.onTournamentAction) continue;
    const delta = scorer.onTournamentAction(payload, tournament);
    if (!delta) continue;
    const result = await applyContribution(tournament.id, delta);
    if (!result.applied && result.reason === "duplicate") {
      logger.info("tournament.action.projection.duplicate", {
        tournamentId: tournament.id,
        userId: payload.userId,
        provider: payload.provider,
        providerEventId: payload.sourceId,
      });
    }
  }
}

/** Deposit tournaments: reconcile contributions vs entries; auto-correct on ACTIVE drift. */
async function reconcileDepositTournament(tournamentId: number): Promise<ReconcileReport> {
  const tournament = await findTournamentById(tournamentId);
  if (!tournament) throw new Error("Tournament not found");

  const scorer = getMetricScorer(tournament.metric);
  if (!scorer) {
    await computeScoresForTournament(tournament as Parameters<typeof computeScoresForTournament>[0]);
    await touchScoresReconciledAt(tournamentId);
    return { tournamentId, driftCount: 0, corrected: 0 };
  }

  const window = { startsAt: tournament.startsAt, endsAt: tournament.endsAt };
  const expected = await scorer.reconcile(tournament, window);
  const stored = await getEntryScores(tournamentId);

  let driftCount = 0;
  let corrected = 0;
  const allUserIds = new Set([...expected.keys(), ...stored.keys()]);

  for (const userId of allUserIds) {
    const exp = expected.get(userId)?.total ?? 0;
    const got = stored.get(userId) ?? 0;
    if (Math.abs(exp - got) > DRIFT_TOLERANCE) {
      driftCount++;
      logger.warn("tournament.deposit.drift", {
        tournamentId,
        userId,
        expected: exp,
        stored: got,
        metric: tournament.metric,
      });
    }
  }

  if (driftCount > 0 && tournament.status === "ACTIVE") {
    const rows = Array.from(expected.entries()).map(([userId, b]) => ({
      userId,
      score: b.total,
    }));
    await batchUpsertEntriesFromReconcile(tournamentId, rows);
    corrected = driftCount;
    logger.warn("tournament.deposit.drift.corrected", { tournamentId, corrected });
  }

  await touchScoresReconciledAt(tournamentId);
  return { tournamentId, driftCount, corrected };
}

/** Offerwall tournaments: detect-only triple check; never auto-correct. */
async function reconcileOfferwallTournament(tournamentId: number): Promise<ReconcileReport> {
  const tournament = await findTournamentById(tournamentId);
  if (!tournament) throw new Error("Tournament not found");

  const offerwallDrift = await detectOfferwallDrift(tournament);
  return {
    tournamentId,
    driftCount: offerwallDrift.driftCount,
    corrected: 0,
    offerwallDrift,
  };
}

/** Minigame wins: reconcile vs GameSessionLog; auto-correct ACTIVE drift like deposits. */
async function reconcileMinigameTournament(tournamentId: number): Promise<ReconcileReport> {
  const tournament = await findTournamentById(tournamentId);
  if (!tournament) throw new Error("Tournament not found");

  const scorer = getMetricScorer(tournament.metric);
  if (!scorer) {
    await computeScoresForTournament(tournament as Parameters<typeof computeScoresForTournament>[0]);
    await touchScoresReconciledAt(tournamentId);
    return { tournamentId, driftCount: 0, corrected: 0 };
  }

  const window = { startsAt: tournament.startsAt, endsAt: tournament.endsAt };
  const expected = await scorer.reconcile(tournament, window);
  const stored = await getEntryScores(tournamentId);

  let driftCount = 0;
  let corrected = 0;
  const allUserIds = new Set([...expected.keys(), ...stored.keys()]);

  for (const userId of allUserIds) {
    const exp = expected.get(userId)?.total ?? 0;
    const got = stored.get(userId) ?? 0;
    if (Math.abs(exp - got) > DRIFT_TOLERANCE) {
      driftCount++;
      logger.warn("tournament.minigame.drift", {
        tournamentId,
        userId,
        expected: exp,
        stored: got,
        metric: tournament.metric,
      });
    }
  }

  if (driftCount > 0 && tournament.status === "ACTIVE") {
    const rows = Array.from(expected.entries()).map(([userId, b]) => ({
      userId,
      score: b.total,
    }));
    await batchUpsertEntriesFromReconcile(tournamentId, rows);
    corrected = driftCount;
    logger.warn("tournament.minigame.drift.corrected", { tournamentId, corrected });
  }

  await touchScoresReconciledAt(tournamentId);
  return { tournamentId, driftCount, corrected };
}

export async function reconcileTournament(tournamentId: number): Promise<ReconcileReport> {
  const tournament = await findTournamentById(tournamentId);
  if (!tournament) throw new Error("Tournament not found");

  if (isOfferwallIncrementalMetric(tournament.metric)) {
    return reconcileOfferwallTournament(tournamentId);
  }

  if (isMinigameIncrementalMetric(tournament.metric)) {
    return reconcileMinigameTournament(tournamentId);
  }

  if (DEPOSIT_INCREMENTAL_METRICS.includes(tournament.metric)) {
    return reconcileDepositTournament(tournamentId);
  }

  await computeScoresForTournament(tournament as Parameters<typeof computeScoresForTournament>[0]);
  await touchScoresReconciledAt(tournamentId);
  return { tournamentId, driftCount: 0, corrected: 0 };
}

export async function reconcileAllActive(): Promise<ReconcileReport[]> {
  const active = await findActiveTournaments();
  const reports: ReconcileReport[] = [];
  for (const t of active) {
    try {
      reports.push(await reconcileTournament(t.id));
    } catch (err) {
      logger.error("tournament.reconcile.failed", {
        tournamentId: t.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return reports;
}

/** Legacy batch scorers for non-incremental metrics only. */
export async function reconcileLegacyBatchTournament(tournamentId: number): Promise<void> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return;
  if (INCREMENTAL_METRICS.includes(tournament.metric)) return;
  await computeScoresForTournament(tournament);
}
