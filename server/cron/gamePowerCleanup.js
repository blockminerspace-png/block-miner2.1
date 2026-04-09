import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";
import { cleanupStaleAutoMiningV2Impressions } from "../services/autoMiningV2/autoMiningV2Service.js";

const logger = loggerLib.child("GamePowerCleanup");

export function startGamePowerCleanup({ engine }) {
  logger.info("Game power & inventory cleanup started");

  const interval = setInterval(async () => {
    try {
      const now = new Date();

      // 1. Cleanup expired inventory items (Faucet rewards, etc.)
      const expiredInventory = await prisma.userInventory.deleteMany({
        where: { expiresAt: { lt: now } }
      });

      if (expiredInventory.count > 0) {
        logger.info(`Cleaned up ${expiredInventory.count} expired inventory items.`);
      }

      // 2. Cleanup expired game powers (Optional: delete instead of just letting them expire)
      // They are filtered by expiresAt in the profile loader, but deleting keeps DB small.
      const expiredGamePowers = await prisma.userPowerGame.deleteMany({
        where: { expiresAt: { lt: now } }
      });

      if (expiredGamePowers.count > 0) {
        logger.info(`Cleaned up ${expiredGamePowers.count} expired game powers.`);
      }

      const expiredYtPowers = await prisma.youtubeWatchPower.deleteMany({
        where: { expiresAt: { lt: now } }
      });

      if (expiredYtPowers.count > 0) {
        logger.info(`Cleaned up ${expiredYtPowers.count} expired YouTube powers.`);
      }

      const staleAmV2Imp = await cleanupStaleAutoMiningV2Impressions();
      if (staleAmV2Imp > 0) {
        logger.info(`Cleaned up ${staleAmV2Imp} stale Auto Mining v2 banner impressions.`);
      }

      const expiredAmV2Grants = await prisma.autoMiningV2PowerGrant.deleteMany({
        where: { expiresAt: { lt: now } }
      });
      if (expiredAmV2Grants.count > 0) {
        logger.info(`Cleaned up ${expiredAmV2Grants.count} expired Auto Mining v2 power grants.`);
      }

    } catch (error) {
      logger.error("Cleanup error", { error: error.message });
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  return [interval];
}
