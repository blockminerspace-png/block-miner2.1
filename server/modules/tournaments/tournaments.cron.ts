import _prisma from "../../src/db/prisma.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
import { computeScoresForTournament, finalizeTournament, alignActiveTournamentWindows } from "./tournaments.service.js";
import { isTournamentIncrementalScoringEnabled } from "./config/feature-flags.js";
import { reconcileAllActive, reconcileLegacyBatchTournament } from "./application/tournament-engine.js";
import { OFFERS_INCREMENTAL_METRICS } from "./domain/tournament-action.providers.js";
import { processTournamentOutboxBatch } from "./infrastructure/outbox/tournament-outbox.processor.js";
import { registerTournamentMetricScorers } from "./domain/metrics/register-scorers.js";
import { runOfferwallShadowValidation } from "./application/offerwall-shadow-validation.service.js";

let scoreIntervalId: ReturnType<typeof setInterval> | null = null;
let lifecycleIntervalId: ReturnType<typeof setInterval> | null = null;
let outboxIntervalId: ReturnType<typeof setInterval> | null = null;
let reconcileIntervalId: ReturnType<typeof setInterval> | null = null;
let shadowValidationIntervalId: ReturnType<typeof setInterval> | null = null;

const INCREMENTAL_METRICS = new Set<string>([
  "DEPOSITS_USD",
  "DEPOSITS_POL",
  ...OFFERS_INCREMENTAL_METRICS,
]);

export function startTournamentsCron(): Record<string, unknown> {
  registerTournamentMetricScorers();

  // Score updater: every 5 minutes (legacy batch metrics; incremental uses reconcile)
  scoreIntervalId = setInterval(() => { void runScoreUpdater(); }, 5 * 60 * 1000);

  // Reconcile drift: every 15 minutes when engine v2 enabled
  if (isTournamentIncrementalScoringEnabled()) {
    reconcileIntervalId = setInterval(() => { void runReconcile(); }, 15 * 60 * 1000);
    outboxIntervalId = setInterval(() => { void processTournamentOutboxBatch().catch(() => {}); }, 30_000);
    shadowValidationIntervalId = setInterval(() => { void runShadowValidation(); }, 60 * 60 * 1000);
  }

  // Lifecycle manager: every 60 seconds (SCHEDULED → ACTIVE, ACTIVE → finalize)
  lifecycleIntervalId = setInterval(() => { void runLifecycleManager(); }, 60 * 1000);

  void runLifecycleManager();
  void alignActiveTournamentWindows().catch((err) =>
    console.error("[tournaments] align windows error:", err),
  );
  void runScoreUpdater();
  if (isTournamentIncrementalScoringEnabled()) {
    void runReconcile();
    void processTournamentOutboxBatch().catch(() => {});
    void runShadowValidation();
  }

  return {
    tournamentScore: scoreIntervalId,
    tournamentLifecycle: lifecycleIntervalId,
    tournamentOutbox: outboxIntervalId,
    tournamentReconcile: reconcileIntervalId,
    tournamentShadowValidation: shadowValidationIntervalId,
  };
}

async function runScoreUpdater(): Promise<void> {
  try {
    const active = await prisma.tournament.findMany({
      where: { status: "ACTIVE" },
    });
    for (const tournament of active) {
      try {
        if (isTournamentIncrementalScoringEnabled() && INCREMENTAL_METRICS.has(tournament.metric)) {
          continue;
        }
        await computeScoresForTournament(tournament);
      } catch (err) {
        console.error(`[tournaments] score update failed for #${tournament.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[tournaments] score updater error:", err);
  }
}

async function runShadowValidation(): Promise<void> {
  try {
    const reports = await runOfferwallShadowValidation();
    const drift = reports.filter((r) => r.driftCount > 0);
    if (drift.length > 0) {
      console.warn(
        `[tournaments] shadow validation drift in ${drift.length} offerwall tournament(s) (no auto-fix)`,
      );
    }
  } catch (err) {
    console.error("[tournaments] shadow validation error:", err);
  }
}

async function runReconcile(): Promise<void> {
  try {
    const reports = await reconcileAllActive();
    const withDrift = reports.filter((r) => r.driftCount > 0);
    const corrected = withDrift.filter((r) => r.corrected > 0);
    const detectedOnly = withDrift.filter((r) => r.corrected === 0);
    if (corrected.length > 0) {
      console.warn(`[tournaments] reconcile auto-corrected drift in ${corrected.length} deposit tournament(s)`);
    }
    if (detectedOnly.length > 0) {
      console.warn(`[tournaments] reconcile detected drift in ${detectedOnly.length} offerwall tournament(s) (no auto-fix)`);
    }
    const active = await prisma.tournament.findMany({ where: { status: "ACTIVE" } });
    for (const t of active) {
      if (!INCREMENTAL_METRICS.has(t.metric)) {
        await reconcileLegacyBatchTournament(t.id);
      }
    }
  } catch (err) {
    console.error("[tournaments] reconcile error:", err);
  }
}

async function runLifecycleManager(): Promise<void> {
  const now = new Date();
  try {
    const toActivate = await prisma.tournament.findMany({
      where: { status: "SCHEDULED", startsAt: { lte: now } },
    });
    for (const t of toActivate) {
      await prisma.tournament.update({ where: { id: t.id }, data: { status: "ACTIVE" } });
      console.info(`[tournaments] activated tournament #${t.id} "${t.name}"`);
    }

    const toFinalize = await prisma.tournament.findMany({
      where: { status: "ACTIVE", endsAt: { lte: now } },
    });
    for (const t of toFinalize) {
      try {
        const { ranked, rewarded } = await finalizeTournament(t.id);
        console.info(`[tournaments] finalized #${t.id} "${t.name}" — ${ranked} ranked, ${rewarded} rewarded`);
      } catch (err) {
        console.error(`[tournaments] finalization failed for #${t.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[tournaments] lifecycle manager error:", err);
  }
}
