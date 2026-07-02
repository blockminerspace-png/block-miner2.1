import { computeUsdValue, resolveAndPersistPrice } from "../../../pricing/index.js";
import { resolveBlockTimestamp } from "../blockchain/block-timestamp.resolver.js";

export type DepositSource = "treasury" | "contract" | "hd_deposit" | string;

export function countsForDepositTournament(source: DepositSource | null | undefined): boolean {
  return source !== "hd_deposit";
}

export type DepositValuationInput = {
  polAmount: number;
  blockNumber: number;
  source: DepositSource;
};

export type DepositValuationResult = {
  confirmedEventAt: Date;
  usdRate: number;
  usdValue: number;
  priceSnapshotId: number;
  countsForTournament: boolean;
};

/**
 * Resolves immutable USD valuation at deposit confirmation moment.
 */
export async function valueDepositAtConfirmation(
  input: DepositValuationInput,
): Promise<DepositValuationResult> {
  const confirmedEventAt = await resolveBlockTimestamp(input.blockNumber);
  const snapshot = await resolveAndPersistPrice("POL", confirmedEventAt);
  const usdRate = snapshot.priceUsd;
  const usdValue = computeUsdValue(input.polAmount, usdRate);
  return {
    confirmedEventAt,
    usdRate,
    usdValue,
    priceSnapshotId: snapshot.id,
    countsForTournament: countsForDepositTournament(input.source),
  };
}
