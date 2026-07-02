export type DepositRankingUnit = 'usd' | 'pol_legacy';

export function isDepositTournamentMetric(metric: string): boolean {
  return metric === 'DEPOSITS_USD' || metric === 'DEPOSITS_POL';
}

export function isUsdDepositRanking(metric: string): boolean {
  return metric === 'DEPOSITS_USD';
}

export function isPolDepositRanking(metric: string): boolean {
  return metric === 'DEPOSITS_POL';
}

export function formatUsd(value: number, locale = 'pt-BR'): string {
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPolAmount(value: number): string {
  return `${value.toFixed(4)} POL`;
}

/** Ranking/podium score — USD for DEPOSITS_USD, POL for DEPOSITS_POL. */
export function formatDepositRankScore(metric: string, score: number): string {
  if (metric === 'DEPOSITS_USD') return formatUsd(score);
  if (metric === 'DEPOSITS_POL') return formatPolAmount(score);
  return String(score);
}

export function formatDepositRankScoreWithPolHint(
  metric: string,
  score: number,
  polEquivalent?: number | null,
): { primary: string; secondary?: string } {
  if (metric === 'DEPOSITS_USD') {
    return {
      primary: formatUsd(score),
      secondary: polEquivalent != null && polEquivalent > 0 ? formatPolAmount(polEquivalent) : undefined,
    };
  }
  if (metric === 'DEPOSITS_POL') {
    return { primary: formatPolAmount(score) };
  }
  return { primary: String(score) };
}

export function depositRankColumnKey(metric: string): string {
  if (metric === 'DEPOSITS_USD') return 'tournaments.deposit_rank_column';
  if (metric === 'DEPOSITS_POL') return 'tournaments.deposit_rank_column_pol';
  return `tournaments.metrics.${metric}`;
}

export function depositTotalLabelKey(metric: string): string {
  if (metric === 'DEPOSITS_USD') return 'tournaments.deposit_rank_total_label';
  if (metric === 'DEPOSITS_POL') return 'tournaments.deposit_rank_total_label_pol';
  return 'tournaments.score';
}

/** Admin audit row formatting. */
export function formatDepositRowValue(
  metric: string,
  usdValue: number | null | undefined,
  amountPol: number,
): { primary: string; secondary?: string } {
  if (metric === 'DEPOSITS_USD' && usdValue != null && Number.isFinite(usdValue)) {
    return {
      primary: formatUsd(usdValue),
      secondary: amountPol > 0 ? formatPolAmount(amountPol) : undefined,
    };
  }
  return { primary: formatPolAmount(amountPol) };
}

export function metricLabelKey(metric: string): string {
  if (metric === 'DEPOSITS_USD') return 'tournaments.metrics.DEPOSITS_USD';
  if (metric === 'DEPOSITS_POL') return 'tournaments.metrics.DEPOSITS_POL_LEGACY';
  return `tournaments.metrics.${metric}`;
}

/** Admin audit summaries only. */
export function formatSummaryTotal(
  metric: string,
  summary: { totalUsd?: number | null; totalPol?: number },
): string {
  if (metric === 'DEPOSITS_USD') return formatUsd(summary.totalUsd ?? 0);
  return formatPolAmount(summary.totalPol ?? 0);
}
