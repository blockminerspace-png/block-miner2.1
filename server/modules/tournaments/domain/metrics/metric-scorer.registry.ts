import type { MetricScorer } from "./metric-scorer.interface.js";
import type { TournamentMetric } from "../types.js";

const scorers = new Map<TournamentMetric, MetricScorer>();

export function registerMetricScorer(scorer: MetricScorer): void {
  scorers.set(scorer.metric, scorer);
}

export function getMetricScorer(metric: TournamentMetric): MetricScorer | undefined {
  return scorers.get(metric);
}

export function getAllMetricScorers(): MetricScorer[] {
  return Array.from(scorers.values());
}

export function clearMetricScorersForTests(): void {
  scorers.clear();
}
