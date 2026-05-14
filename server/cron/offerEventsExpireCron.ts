import loggerLib from "../utils/logger.js";
import prisma from "../src/db/prisma.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("OfferEventsExpireCron");

export async function deactivateExpiredOfferEvents(): Promise<number> {
  const now = new Date();
  const result = await prisma.offerEvent.updateMany({
    where: {
      deletedAt: null,
      isActive: true,
      endsAt: { lt: now },
    },
    data: { isActive: false },
  });
  if (result.count > 0) {
    logger.info(`Deactivated ${result.count} expired offer event(s).`);
  }
  return result.count;
}

export function startOfferEventsExpireCron(): { offerEventsExpireTimer: ReturnType<typeof setInterval> } {
  const intervalMs = Number(process.env.OFFER_EVENTS_EXPIRE_CRON_MS || 300_000);
  const handle = setInterval(() => {
    deactivateExpiredOfferEvents().catch((err: unknown) => {
      logger.warn("Expire sweep failed", { error: errMsg(err) });
    });
  }, intervalMs);
  handle.unref?.();
  void deactivateExpiredOfferEvents().catch(() => {});
  return { offerEventsExpireTimer: handle };
}
