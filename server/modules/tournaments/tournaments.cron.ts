import _prisma from "../../src/db/prisma.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
import { computeScoresForTournament, finalizeTournament } from "./tournaments.service.js";

let scoreIntervalId: ReturnType<typeof setInterval> | null = null;
let lifecycleIntervalId: ReturnType<typeof setInterval> | null = null;

export function startTournamentsCron(): Record<string, unknown> {
  // Score updater: every 5 minutes
  scoreIntervalId = setInterval(() => { void runScoreUpdater(); }, 5 * 60 * 1000);

  // Lifecycle manager: every 60 seconds (SCHEDULED → ACTIVE, ACTIVE → finalize)
  lifecycleIntervalId = setInterval(() => { void runLifecycleManager(); }, 60 * 1000);

  // Run immediately on startup
  void runLifecycleManager();
  void runScoreUpdater();

  return { tournamentScore: scoreIntervalId, tournamentLifecycle: lifecycleIntervalId };
}

async function runScoreUpdater(): Promise<void> {
  try {
    const active = await prisma.tournament.findMany({
      where: { status: "ACTIVE" },
    });
    for (const tournament of active) {
      try {
        await computeScoresForTournament(tournament);
      } catch (err) {
        console.error(`[tournaments] score update failed for #${tournament.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[tournaments] score updater error:", err);
  }
}

async function runLifecycleManager(): Promise<void> {
  const now = new Date();
  try {
    // Activate SCHEDULED tournaments whose startsAt is past
    const toActivate = await prisma.tournament.findMany({
      where: { status: "SCHEDULED", startsAt: { lte: now } },
    });
    for (const t of toActivate) {
      await prisma.tournament.update({ where: { id: t.id }, data: { status: "ACTIVE" } });
      console.info(`[tournaments] activated tournament #${t.id} "${t.name}"`);
    }

    // Finalize ACTIVE tournaments whose endsAt is past
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
