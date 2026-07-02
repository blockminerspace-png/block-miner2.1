import type { TournamentActionPayload } from "../../domain/events/tournament-action.event.js";
import { handleTournamentAction } from "../tournament-engine.js";
import { registerTournamentMetricScorers } from "../../domain/metrics/register-scorers.js";
import { isTournamentIncrementalScoringEnabled } from "../../config/feature-flags.js";
import { processTournamentOutboxBatch } from "../../infrastructure/outbox/tournament-outbox.processor.js";

export async function onTournamentActionEvent(
  payload: TournamentActionPayload,
): Promise<void> {
  registerTournamentMetricScorers();
  if (isTournamentIncrementalScoringEnabled()) {
    await handleTournamentAction(payload);
  }
}

export { processTournamentOutboxBatch };
