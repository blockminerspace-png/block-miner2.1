import _prisma from "../../../../src/db/prisma.js";
import { TOURNAMENT_EVENT_DEPOSIT_CONFIRMED } from "../../domain/events/deposit-confirmed.event.js";
import type { DepositConfirmedPayload } from "../../domain/events/deposit-confirmed.event.js";
import {
  TOURNAMENT_EVENT_ACTION_RECORDED,
  type TournamentActionPayload,
} from "../../domain/events/tournament-action.event.js";
import { handleDepositConfirmed, handleTournamentAction } from "../../application/tournament-engine.js";
import { registerTournamentMetricScorers } from "../../domain/metrics/register-scorers.js";
import loggerLib from "../../../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("TournamentOutbox");

const BATCH_SIZE = 50;
const MAX_RETRIES = 10;

export async function processTournamentOutboxBatch(): Promise<number> {
  registerTournamentMetricScorers();

  const now = new Date();
  const pending = await prisma.tournamentDomainOutbox.findMany({
    where: { status: "pending", nextRunAt: { lte: now } },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  let processed = 0;
  for (const row of pending) {
    try {
      if (row.eventType === TOURNAMENT_EVENT_DEPOSIT_CONFIRMED) {
        await handleDepositConfirmed(row.payload as DepositConfirmedPayload);
      } else if (row.eventType === TOURNAMENT_EVENT_ACTION_RECORDED) {
        await handleTournamentAction(row.payload as TournamentActionPayload);
      }
      await prisma.tournamentDomainOutbox.update({
        where: { id: row.id },
        data: { status: "completed", lastError: null },
      });
      logger.info("tournament.outbox.processed", {
        outboxId: row.id,
        eventType: row.eventType,
        idempotencyKey: row.idempotencyKey,
      });
      processed++;
    } catch (err: unknown) {
      const retryCount = (row.retryCount ?? 0) + 1;
      const msg = err instanceof Error ? err.message : String(err);
      const status = retryCount >= MAX_RETRIES ? "failed" : "pending";
      const nextRunAt = new Date(Date.now() + Math.min(60_000, 1000 * 2 ** retryCount));
      await prisma.tournamentDomainOutbox.update({
        where: { id: row.id },
        data: { retryCount, lastError: msg, status, nextRunAt },
      });
      logger.warn("tournament.outbox.failed", {
        outboxId: row.id,
        eventType: row.eventType,
        idempotencyKey: row.idempotencyKey,
        retryCount,
        status,
        error: msg,
      });
    }
  }
  return processed;
}
