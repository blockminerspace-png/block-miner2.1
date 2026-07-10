#!/usr/bin/env node
/**
 * CLI wrapper for PostgreSQL logical backups (pg_dump).
 * Uses the same service as the admin backup API.
 */
import "dotenv/config";
import prisma from "#server/src/db/prisma.js";
import { createPostgresSqlBackup } from "#server/services/databaseBackupService.js";
import loggerLib from "#server/utils/logger.js";

const log = loggerLib.child("RunDatabaseBackup");

async function main() {
  const result = await createPostgresSqlBackup({
    prisma,
    logger: {
      info: (ev, meta) => log.info(ev, meta),
      warn: (ev, meta) => log.warn(ev, meta),
      error: (ev, meta) => log.error(ev, meta),
    },
  });
  log.info("backup_complete", { filename: result?.filename ?? result });
  await prisma.$disconnect();
}

main().catch((err) => {
  log.error("backup_failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
