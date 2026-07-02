export type DepositRankingUnit = "usd" | "pol_legacy";

export type DepositTournamentSummary = {
  rankingUnit: DepositRankingUnit;
  totalUsd: number | null;
  totalPol: number;
  txCount: number;
  participantCount: number;
  largestDepositUsd: number | null;
  largestDepositPol: number;
  remainderUsd: number | null;
  remainderPol: number;
  remainderTxCount: number;
};

export type DepositBreakdownRow = {
  id: number;
  amountPol: number;
  usdValue: number | null;
  usdRate: number | null;
  completedAt: string | null;
  createdAt: string;
  txHash: string | null;
  source?: string | null;
};

export function depositRankingUnit(metric: string): DepositRankingUnit {
  return metric === "DEPOSITS_USD" ? "usd" : "pol_legacy";
}

export function isDepositTournamentMetric(metric: string): boolean {
  return metric === "DEPOSITS_USD" || metric === "DEPOSITS_POL";
}

export function normalizeDepositSummary(
  metric: string,
  raw: Record<string, unknown> | null | undefined,
): DepositTournamentSummary | null {
  if (!raw) return null;
  const unit = depositRankingUnit(metric);
  const totalPol = Number(raw.totalPol ?? 0);
  const totalUsd = raw.totalUsd != null ? Number(raw.totalUsd) : null;
  const largestPol = Number(raw.largestDepositPol ?? 0);
  const largestUsd = raw.largestDepositUsd != null ? Number(raw.largestDepositUsd) : null;
  const remainderPol = Number(raw.remainderPol ?? 0);
  const remainderUsd = raw.remainderUsd != null ? Number(raw.remainderUsd) : null;
  return {
    rankingUnit: unit,
    totalPol,
    totalUsd,
    txCount: Number(raw.txCount ?? 0),
    participantCount: Number(raw.participantCount ?? 0),
    largestDepositPol: largestPol,
    largestDepositUsd: largestUsd,
    remainderPol,
    remainderUsd,
    remainderTxCount: Number(raw.remainderTxCount ?? 0),
  };
}
