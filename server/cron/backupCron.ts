import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("BackupCron");

export function startBackupCron(): unknown[] {
  logger.info("Backup cron started");
  return [];
}

export function runFullSiteBackupOnStartup(): void {
  logger.info("Simulating full site backup on startup...");
}
