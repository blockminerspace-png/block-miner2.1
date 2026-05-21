import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { cleanupStaleAutoMiningV2Impressions } from "../services/autoMiningV2/autoMiningV2Service.js";
import { isAutoMiningV2SchemaAvailable } from "../services/autoMiningV2/autoMiningV2DbAvailability.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("GamePowerCleanup");

export type GamePowerCleanupArgs = {
  engine: unknown;
  io?: unknown;
  run?: unknown;
};

export function startGamePowerCleanup(_args: GamePowerCleanupArgs): ReturnType<typeof setInterval>[] {
  logger.info("Game power & inventory cleanup started");

  const interval = setInterval(async () => {
    try {
      const now = new Date();

      const expiredInventory = await prisma.userInventory.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      if (expiredInventory.count > 0) {
        logger.info(`Cleaned up ${expiredInventory.count} expired inventory items.`);
      }

      const expiredGamePowers = await prisma.userPowerGame.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      if (expiredGamePowers.count > 0) {
        logger.info(`Cleaned up ${expiredGamePowers.count} expired game powers.`);
      }

      const expiredYtPowers = await prisma.youtubeWatchPower.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      if (expiredYtPowers.count > 0) {
        logger.info(`Cleaned up ${expiredYtPowers.count} expired YouTube powers.`);
      }

      const expiredShortlinkPowers = await prisma.shortlinkPower.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      if (expiredShortlinkPowers.count > 0) {
        logger.info(`Cleaned up ${expiredShortlinkPowers.count} expired shortlink powers.`);
      }

      if (await isAutoMiningV2SchemaAvailable()) {
        const staleAmV2Imp = await cleanupStaleAutoMiningV2Impressions();
        if (staleAmV2Imp > 0) {
          logger.info(`Cleaned up ${staleAmV2Imp} stale Auto Mining v2 banner impressions.`);
        }

        const expiredAmV2Grants = await prisma.autoMiningV2PowerGrant.deleteMany({
          where: { expiresAt: { lt: now } },
        });
        if (expiredAmV2Grants.count > 0) {
          logger.info(`Cleaned up ${expiredAmV2Grants.count} expired Auto Mining v2 power grants.`);
        }
      }
    } catch (error: unknown) {
      logger.error("Cleanup error", { error: errMsg(error) });
    }
  }, 5 * 60 * 1000);

  return [interval];
}
