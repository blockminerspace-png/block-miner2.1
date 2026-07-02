import _prisma from "../../../../src/db/prisma.js";
import type { TournamentActionPayload } from "../../domain/events/tournament-action.event.js";
import {
  TOURNAMENT_EVENT_ACTION_RECORDED,
  tournamentActionIdempotencyKey,
  tournamentActionOutboxPayload,
} from "../../domain/events/tournament-action.event.js";
import type { TournamentActionProvider } from "../../domain/tournament-action.providers.js";
import type { InsertTournamentActionResult } from "../../domain/tournament-engine.types.js";
import loggerLib from "../../../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("TournamentAction");

export type RecordTournamentActionInput = {
  userId: number;
  provider: TournamentActionProvider;
  /** Unique provider event id — maps to DB column source_id (UNIQUE provider+source_id). */
  providerEventId: string;
  actionCount: number;
  executedAtUTC: Date;
  tournamentEligible?: boolean;
  metadata?: Record<string, unknown>;
};

/** @deprecated use providerEventId */
export type RecordTournamentActionInputLegacy = RecordTournamentActionInput & {
  sourceId?: string;
};

function normalizeInput(
  input: RecordTournamentActionInput | (RecordTournamentActionInput & { sourceId?: string }),
): RecordTournamentActionInput {
  const providerEventId =
    input.providerEventId ??
    ("sourceId" in input ? (input as { sourceId?: string }).sourceId : undefined);
  if (!providerEventId) {
    throw new Error("providerEventId is required");
  }
  return { ...input, providerEventId };
}

export async function findTournamentActionByProviderEvent(
  provider: string,
  providerEventId: string,
) {
  return prisma.tournamentAction.findUnique({
    where: {
      provider_sourceId: { provider, sourceId: providerEventId },
    },
  });
}

export async function insertTournamentAction(
  input: RecordTournamentActionInput | (RecordTournamentActionInput & { sourceId?: string }),
): Promise<InsertTournamentActionResult> {
  const normalized = normalizeInput(input);
  const actionCount = Math.trunc(normalized.actionCount);
  if (actionCount <= 0) {
    return { payload: null, duplicate: false };
  }

  try {
    const row = await prisma.tournamentAction.create({
      data: {
        userId: normalized.userId,
        provider: normalized.provider,
        actionCount,
        executedAtUTC: normalized.executedAtUTC,
        sourceId: normalized.providerEventId,
        tournamentEligible: normalized.tournamentEligible !== false,
        metadata: normalized.metadata ?? undefined,
      },
    });
    const payload = tournamentActionOutboxPayload(row);
    logger.info("tournament.action.created", {
      actionId: payload.actionId,
      userId: payload.userId,
      provider: payload.provider,
      providerEventId: payload.sourceId,
      actionCount: payload.actionCount,
      executedAtUTC: payload.executedAtUTC,
    });
    return { payload, duplicate: false };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      const existing = await findTournamentActionByProviderEvent(
        normalized.provider,
        normalized.providerEventId,
      );
      if (!existing) {
        return { payload: null, duplicate: true };
      }
      const payload = tournamentActionOutboxPayload(existing);
      logger.info("tournament.action.duplicate", {
        actionId: payload.actionId,
        userId: payload.userId,
        provider: payload.provider,
        providerEventId: payload.sourceId,
      });
      return { payload, duplicate: true };
    }
    throw err;
  }
}

export async function publishTournamentActionOutbox(
  payload: TournamentActionPayload,
  tx?: { tournamentDomainOutbox: { create: (args: unknown) => Promise<unknown> } },
): Promise<boolean> {
  const client = tx ?? prisma;
  const idempotencyKey = tournamentActionIdempotencyKey(
    payload.provider,
    payload.sourceId,
  );
  try {
    await client.tournamentDomainOutbox.create({
      data: {
        eventType: TOURNAMENT_EVENT_ACTION_RECORDED,
        payload,
        status: "pending",
        idempotencyKey,
        nextRunAt: new Date(),
      },
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      logger.info("tournament.outbox.duplicate", {
        provider: payload.provider,
        providerEventId: payload.sourceId,
        idempotencyKey,
      });
      return false;
    }
    throw err;
  }
}
