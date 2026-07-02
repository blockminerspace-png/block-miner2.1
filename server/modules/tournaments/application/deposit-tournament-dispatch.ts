import { enqueueTournamentOutboxDrain, enqueueTournamentDepositProjection } from "../../../jobs/blockminerQueue.js";
import { isTournamentIncrementalScoringEnabled } from "../config/feature-flags.js";
import { processTournamentOutboxBatch } from "../infrastructure/outbox/tournament-outbox.processor.js";
import type { DepositConfirmedPayload } from "../domain/events/deposit-confirmed.event.js";
import { onDepositConfirmedEvent } from "./handlers/deposit-confirmed.handler.js";

/**
 * After deposit is persisted: enqueue async projection or process inline fallback.
 */
export async function dispatchDepositConfirmedForTournaments(
  payload: DepositConfirmedPayload,
): Promise<void> {
  if (!isTournamentIncrementalScoringEnabled()) return;

  const enqueued =
    (await enqueueTournamentDepositProjection(payload)) ||
    (await enqueueTournamentOutboxDrain());

  if (!enqueued) {
    await processTournamentOutboxBatch();
    await onDepositConfirmedEvent(payload);
  }
}
