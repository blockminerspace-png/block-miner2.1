import _prisma from "../../../src/db/prisma.js";
import loggerLib from "../../../utils/logger.js";
import { findTournamentById } from "../infrastructure/repositories/tournament.repository.js";
import { recordTournamentAction } from "./tournament-action-dispatch.js";
import { TOURNAMENT_ACTION_PROVIDER } from "../domain/tournament-action.providers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("MinigameTournamentBackfill");

/** Import wins from game_session_logs into the tournament ledger (idempotent). */
export async function backfillMinigameTournamentFromLogs(tournamentId: number): Promise<number> {
  const tournament = await findTournamentById(tournamentId);
  if (!tournament || tournament.metric !== "MINIGAME_WINS") return 0;

  const now = new Date();
  const upper = tournament.endsAt < now ? tournament.endsAt : now;
  if (upper < tournament.startsAt) return 0;

  const logs = await prisma.gameSessionLog.findMany({
    where: {
      success: true,
      rewardGranted: true,
      createdAt: { gte: tournament.startsAt, lte: upper },
    },
    select: { id: true, userId: true, createdAt: true, gameSlug: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let applied = 0;
  for (const log of logs) {
    try {
      await recordTournamentAction({
        userId: log.userId,
        provider: TOURNAMENT_ACTION_PROVIDER.MINIGAME,
        actionCount: 1,
        executedAtUTC: log.createdAt,
        providerEventId: `gsl:${log.id}`,
        metadata: {
          gameSlug: log.gameSlug,
          backfill: true,
          gameSessionLogId: log.id,
        },
      });
      applied++;
    } catch (err) {
      logger.warn("minigame.backfill.action_failed", {
        tournamentId,
        gameSessionLogId: log.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (applied > 0) {
    logger.info("minigame.backfill.done", { tournamentId, applied, totalLogs: logs.length });
  }
  return applied;
}

export function resolveTournamentStatusForWindow(
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
): "ACTIVE" | "SCHEDULED" | "ENDED" {
  if (now < startsAt) return "SCHEDULED";
  if (now >= endsAt) return "ENDED";
  return "ACTIVE";
}
