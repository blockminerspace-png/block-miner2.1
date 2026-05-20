/** Business logic lives in checkin.controller.ts (legacy monolith) — re-exported for routes/cron. */
export {
  balanceCheckinSyntheticTxHash,
  resolveCheckinReceiverFromEnv,
  isCheckinPaymentRequired,
  processStalePendingCheckins,
  tryFinalizeCheckinRow,
  tryFinalizePeriodicCheckinRow,
  tryFinalizeTodayCheckin,
  getStatus,
  claimCheckin,
  claimCheckinOnchain,
  confirmCheckin,
  checkinWallet,
  checkinBalance,
  getCheckinRewards,
  getCheckinHistory,
} from "./checkin.controller.js";
