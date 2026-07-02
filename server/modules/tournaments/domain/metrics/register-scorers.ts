import { registerMetricScorer } from "./metric-scorer.registry.js";
import { DepositPolScorer, DepositUsdScorer } from "./deposit.scorer.js";
import { createOffersScorers } from "./offerwall.scorer.js";

let registered = false;

export function registerTournamentMetricScorers(): void {
  if (registered) return;
  registerMetricScorer(new DepositUsdScorer());
  registerMetricScorer(new DepositPolScorer());
  for (const scorer of createOffersScorers()) {
    registerMetricScorer(scorer);
  }
  registered = true;
}
