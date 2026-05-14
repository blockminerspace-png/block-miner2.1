import loggerLib from "../utils/logger.js";
import { processStalePendingCheckins } from "../controllers/checkinController.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("CheckinPendingCron");

export function startCheckinPendingCron(): { checkinPendingTimer: ReturnType<typeof setInterval> } {
  const intervalMs = Number(process.env.CHECKIN_PENDING_CRON_MS || 45_000);
  const handle = setInterval(() => {
    processStalePendingCheckins().catch((err: unknown) => {
      logger.warn("Pending check-in sweep failed", { error: errMsg(err) });
    });
  }, intervalMs);
  handle.unref?.();
  processStalePendingCheckins().catch(() => {});
  return { checkinPendingTimer: handle };
}
