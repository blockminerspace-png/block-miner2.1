import loggerLib from "../utils/logger.js";
import { processStalePendingCheckins } from "../controllers/checkinController.js";

const logger = loggerLib.child("CheckinPendingCron");

export function startCheckinPendingCron() {
  const intervalMs = Number(process.env.CHECKIN_PENDING_CRON_MS || 45_000);
  const handle = setInterval(() => {
    processStalePendingCheckins().catch((err) => {
      logger.warn("Pending check-in sweep failed", { error: err.message });
    });
  }, intervalMs);
  handle.unref?.();
  processStalePendingCheckins().catch(() => {});
  return { checkinPendingTimer: handle };
}
