export type AssetCode = "POL";

export type PriceSnapshot = {
  id: number;
  asset: AssetCode;
  eventAt: Date;
  priceUsd: number;
  source: string;
  sourceRef: string | null;
};

export type ResolvedDepositValuation = {
  eventAt: Date;
  usdRate: number;
  usdValue: number;
  priceSnapshotId: number;
  countsForTournament: boolean;
};
