import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("ShortlinkReset");

export function startShortlinkResetCron(): unknown[] {
  logger.info("Shortlink reset cron started");
  return [];
}
