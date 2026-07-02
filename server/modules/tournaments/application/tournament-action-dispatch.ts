import { isTournamentIncrementalScoringEnabled } from "../config/feature-flags.js";
import {
  enqueueTournamentActionProjection,
  enqueueTournamentOutboxDrain,
} from "../../../jobs/blockminerQueue.js";
import {
  insertTournamentAction,
  publishTournamentActionOutbox,
  type RecordTournamentActionInput,
} from "../infrastructure/repositories/tournament-action.repository.js";
import { processTournamentOutboxBatch } from "../infrastructure/outbox/tournament-outbox.processor.js";
import loggerLib from "../../../utils/logger.js";

const logger = loggerLib.child("TournamentActionDispatch");

export type { RecordTournamentActionInput } from "../infrastructure/repositories/tournament-action.repository.js";
export {
  TOURNAMENT_ACTION_PROVIDER,
  type TournamentActionProvider,
} from "../domain/tournament-action.providers.js";

/**
 * Persist a normalized action and enqueue incremental tournament projection.
 * Idempotent: duplicate provider events still trigger outbox drain (recovery path).
 */
export async function recordTournamentAction(
  input: RecordTournamentActionInput & { sourceId?: string },
): Promise<void> {
  if (!isTournamentIncrementalScoringEnabled()) return;

  const { payload, duplicate } = await insertTournamentAction(input);
  if (!payload) return;

  if (duplicate) {
    logger.info("tournament.action.dispatch.duplicate_replay", {
      provider: payload.provider,
      providerEventId: payload.sourceId,
      actionId: payload.actionId,
    });
  }

  await publishTournamentActionOutbox(payload);

  const enqueued =
    (await enqueueTournamentActionProjection(payload)) ||
    (await enqueueTournamentOutboxDrain());

  if (!enqueued) {
    logger.info("tournament.action.dispatch.inline_outbox", {
      provider: payload.provider,
      providerEventId: payload.sourceId,
    });
    await processTournamentOutboxBatch();
  }
}
