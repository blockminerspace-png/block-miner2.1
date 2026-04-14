import loggerLib from "../utils/logger.js";
import prisma from "../src/db/prisma.js";

const logger = loggerLib.child("OfferEventsExpireCron");

export async function deactivateExpiredOfferEvents() {
  const now = new Date();
  const result = await prisma.offerEvent.updateMany({
    where: {
      deletedAt: null,
      isActive: true,
      endsAt: { lt: now }
    },
    data: { isActive: false }
  });
  if (result.count > 0) {
    logger.info(`Deactivated ${result.count} expired offer event(s).`);
  }
  return result.count;
}

export function startOfferEventsExpireCron() {
  const intervalMs = Number(process.env.OFFER_EVENTS_EXPIRE_CRON_MS || 300_000);
  const handle = setInterval(() => {
    deactivateExpiredOfferEvents().catch((err) => {
      logger.warn("Expire sweep failed", { error: err.message });
    });
  }, intervalMs);
  handle.unref?.();
  deactivateExpiredOfferEvents().catch(() => {});
  return { offerEventsExpireTimer: handle };
}
