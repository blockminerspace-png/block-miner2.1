import _prisma from "../../../../src/db/prisma.js";
import {
  TOURNAMENT_EVENT_DEPOSIT_CONFIRMED,
  type DepositConfirmedPayload,
  depositConfirmedIdempotencyKey,
} from "../../domain/events/deposit-confirmed.event.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function publishDepositConfirmedOutbox(
  payload: DepositConfirmedPayload,
  tx?: { tournamentDomainOutbox: { create: (args: unknown) => Promise<unknown> } },
): Promise<void> {
  const client = tx ?? prisma;
  const idempotencyKey = depositConfirmedIdempotencyKey(payload.transactionId);
  try {
    await client.tournamentDomainOutbox.create({
      data: {
        eventType: TOURNAMENT_EVENT_DEPOSIT_CONFIRMED,
        payload,
        status: "pending",
        idempotencyKey,
        nextRunAt: new Date(),
      },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") return;
    throw err;
  }
}
