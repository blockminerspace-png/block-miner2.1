/**
 * Replay tournament_actions into Engine V2 (outbox → contributions → entries).
 * Run after backfill-tournament-actions.mjs on production.
 */
import _prisma from "../dist/server/src/db/prisma.js";
import { publishTournamentActionOutbox } from "../dist/server/modules/tournaments/infrastructure/repositories/tournament-action.repository.js";
import { tournamentActionOutboxPayload } from "../dist/server/modules/tournaments/domain/events/tournament-action.event.js";
import { processTournamentOutboxBatch } from "../dist/server/modules/tournaments/infrastructure/outbox/tournament-outbox.processor.js";

const prisma = _prisma;

async function main() {
  const actions = await prisma.tournamentAction.findMany({
    orderBy: { id: "asc" },
  });
  let published = 0;
  for (const row of actions) {
    await publishTournamentActionOutbox(tournamentActionOutboxPayload(row));
    published++;
  }
  let total = 0;
  for (;;) {
    const n = await processTournamentOutboxBatch();
    if (n <= 0) break;
    total += n;
  }
  console.log(`replay: ${published} outbox events enqueued, ${total} processed`);
  console.log(JSON.stringify({
    event: "tournament.replay.completed",
    actions: actions.length,
    published,
    processed: total,
  }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
