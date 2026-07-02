import type { DepositConfirmedPayload } from "../../domain/events/deposit-confirmed.event.js";
import { handleDepositConfirmed } from "../tournament-engine.js";
import { registerTournamentMetricScorers } from "../../domain/metrics/register-scorers.js";
import { isTournamentIncrementalScoringEnabled } from "../../config/feature-flags.js";
import { processTournamentOutboxBatch } from "../../infrastructure/outbox/tournament-outbox.processor.js";

export async function onDepositConfirmedEvent(payload: DepositConfirmedPayload): Promise<void> {
  registerTournamentMetricScorers();
  if (isTournamentIncrementalScoringEnabled()) {
    await handleDepositConfirmed(payload);
  }
}

export { processTournamentOutboxBatch };
