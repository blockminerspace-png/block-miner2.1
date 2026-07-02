#!/usr/bin/env node
/**
 * Offerwall Engine V2 migration orchestrator.
 *
 *   node scripts/migrate-offerwall-run.mjs audit
 *   node scripts/migrate-offerwall-run.mjs backup
 *   node scripts/migrate-offerwall-run.mjs backfill
 *   node scripts/migrate-offerwall-run.mjs project
 *   node scripts/migrate-offerwall-run.mjs compare
 *   node scripts/migrate-offerwall-run.mjs seal
 *   node scripts/migrate-offerwall-run.mjs all
 *   node scripts/migrate-offerwall-run.mjs rollback
 */
import { createHash } from "node:crypto";
import {
  prisma,
  loadActiveOfferwallTournaments,
  runGlobalBackfill,
  projectAllContributions,
  compareAll,
  sealTournaments,
  backupEntries,
  clearContributionsForActiveTournaments,
} from "./lib/offerwall-migration.mjs";

const phase = process.argv[2] ?? "all";
const now = new Date();
const backupDir =
  process.env.OFFERWALL_MIGRATION_BACKUP_DIR ??
  `/tmp/offerwall-migration-${now.toISOString().slice(0, 10)}`;

async function audit() {
  const { compareTournament } = await import("./lib/offerwall-migration.mjs");
  const tournaments = await loadActiveOfferwallTournaments();
  const globalActions = await prisma.tournamentAction.count();
  const globalContribs = await prisma.tournamentScoreContribution.count();
  const globalState = await prisma.tournamentOfferwallMigrationGlobal.findUnique({
    where: { id: 1 },
  });

  const reports = [];
  for (const t of tournaments) {
    reports.push(await compareTournament(t, now));
  }

  console.log(
    JSON.stringify(
      {
        event: "tournament.offerwall.migration.audit",
        auditedAt: now.toISOString(),
        global: {
          actions: globalActions,
          contributions: globalContribs,
          backfill: globalState,
        },
        tournaments: reports,
      },
      null,
      2,
    ),
  );
}

async function rollback() {
  const tournaments = await loadActiveOfferwallTournaments();
  const ids = tournaments.map((t) => t.id);

  const deletedContribs = await prisma.tournamentScoreContribution.deleteMany({
    where: { tournamentId: { in: ids } },
  });
  const deletedActions = await prisma.tournamentAction.deleteMany({
    where: { metadata: { path: ["backfill"], equals: true } },
  });
  await prisma.tournamentShadowValidationAlert.deleteMany({
    where: { tournamentId: { in: ids } },
  });
  await prisma.tournamentOfferwallMigration.deleteMany({
    where: { tournamentId: { in: ids } },
  });
  await prisma.tournamentOfferwallMigrationGlobal.update({
    where: { id: 1 },
    data: { globalBackfillAt: null, globalBackfillActions: 0, globalBackfillSkipped: 0 },
  });

  console.log(
    JSON.stringify({
      event: "tournament.offerwall.migration.rollback",
      deletedContributions: deletedContribs.count,
      deletedBackfillActions: deletedActions.count,
      tournamentIds: ids,
      note: "tournament_entries not modified — restore from backup JSON if needed",
    }),
  );
}

async function runAll() {
  const tournaments = await loadActiveOfferwallTournaments();
  if (tournaments.length === 0) {
    console.error("No active offerwall tournaments");
    process.exit(1);
  }

  const ids = tournaments.map((t) => t.id);
  console.log(JSON.stringify({ event: "migration.backup.start", backupDir, tournamentIds: ids }));
  await backupEntries(ids, backupDir);

  console.log(JSON.stringify({ event: "migration.backfill.start" }));
  const backfill = await runGlobalBackfill(now);
  console.log(JSON.stringify({ event: "migration.backfill.done", ...backfill }));

  console.log(JSON.stringify({ event: "migration.project.clear_contributions" }));
  const cleared = await clearContributionsForActiveTournaments();
  console.log(JSON.stringify({ event: "migration.project.cleared", count: cleared }));

  console.log(JSON.stringify({ event: "migration.project.start" }));
  const project = await projectAllContributions(now);
  console.log(JSON.stringify({ event: "migration.project.done", project }));

  console.log(JSON.stringify({ event: "migration.compare.start" }));
  const { allClean, reports } = await compareAll(now);
  console.log(JSON.stringify({ event: "migration.compare.done", allClean, reports }));

  if (!allClean) {
    console.error(
      JSON.stringify({
        event: "migration.aborted",
        reason: "drift_detected",
        reports: reports.filter((r) => r.driftCount > 0),
      }),
    );
    process.exit(2);
  }

  const seal = await sealTournaments(reports, now);
  console.log(JSON.stringify({ event: "migration.sealed", ...seal }));
  console.log(
    JSON.stringify({
      event: "migration.complete",
      message: "Entries untouched. Shadow validation period started.",
      shadowValidationEndsAt: seal.shadowValidationEndsAt,
    }),
  );
}

async function main() {
  switch (phase) {
    case "audit":
      await audit();
      break;
    case "backup": {
      const tournaments = await loadActiveOfferwallTournaments();
      await backupEntries(
        tournaments.map((t) => t.id),
        backupDir,
      );
      console.log(JSON.stringify({ event: "migration.backup.done", backupDir }));
      break;
    }
    case "backfill": {
      const r = await runGlobalBackfill(now);
      console.log(JSON.stringify({ event: "migration.backfill.done", ...r }));
      break;
    }
    case "project": {
      const r = await projectAllContributions(now);
      console.log(JSON.stringify({ event: "migration.project.done", project: r }));
      break;
    }
    case "compare": {
      const { allClean, reports } = await compareAll(now);
      console.log(JSON.stringify({ event: "migration.compare.done", allClean, reports }));
      if (!allClean) process.exit(2);
      break;
    }
    case "seal": {
      const { allClean, reports } = await compareAll(now);
      if (!allClean) {
        console.error(JSON.stringify({ event: "migration.seal.refused", reports }));
        process.exit(2);
      }
      const seal = await sealTournaments(reports, now);
      console.log(JSON.stringify({ event: "migration.sealed", ...seal }));
      break;
    }
    case "rollback":
      await rollback();
      break;
    case "all":
      await runAll();
      break;
    default:
      console.error(`Unknown phase: ${phase}`);
      process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
