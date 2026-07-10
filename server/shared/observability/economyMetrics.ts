import { moduleActionsTotal, recordModuleAction } from "./metricsRegistry.js";

/** Read-only observability hooks — does not alter economy or rewards. */
export const economyMetrics = {
  faucetClaim: () => recordModuleAction("faucet", "claim"),
  ptcClaim: () => recordModuleAction("ptc", "claim"),
  shortlinkClaim: () => recordModuleAction("shortlinks", "claim"),
  checkinClaim: () => recordModuleAction("checkin", "claim"),
  youtubeClaim: () => recordModuleAction("youtube", "claim"),
  gameComplete: (game?: string) => recordModuleAction("games", game ? `complete:${game}` : "complete"),
  autoMiningClaim: () => recordModuleAction("auto-mining", "claim"),
  internalOfferwallClaim: () => recordModuleAction("internal-offerwall", "claim"),
  offerwallMeCallback: () => recordModuleAction("callback", "offerwallme"),
  zeradsCallback: () => recordModuleAction("callback", "zerads"),
  miningBlock: () => recordModuleAction("mining", "block_settled"),
  walletWithdraw: () => recordModuleAction("wallet", "withdraw_request"),
  referralReward: () => recordModuleAction("referral", "reward"),
  powerBoostGrant: () => recordModuleAction("power-boost", "grant"),
  energyTaxPaid: () => recordModuleAction("energy-tax", "paid"),
  energyTaxSweep: (chargesCreated: number) => recordModuleAction("energy-tax", "sweep", chargesCreated),
  tournamentAction: () => recordModuleAction("tournament", "action"),
};

export function getEconomyMetricsSnapshot(): Array<{ module: string; action: string; total: number }> {
  return moduleActionsTotal.snapshot().map(({ labels, value }) => ({
    module: labels.module || "unknown",
    action: labels.action || "unknown",
    total: value,
  }));
}
