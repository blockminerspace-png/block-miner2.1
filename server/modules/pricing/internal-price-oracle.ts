import { fetchHistoricalUsdPrice } from "./adapters/coingecko.adapter.js";
import { findOrCreatePriceSnapshot } from "./repositories/price-snapshot.repository.js";
import type { AssetCode, PriceSnapshot } from "./types.js";

const COINGECKO_SOURCE = "coingecko";

/**
 * Internal oracle: resolves USD price at event time and persists immutable snapshot in DB.
 */
export async function resolveAndPersistPrice(
  asset: AssetCode,
  eventAt: Date,
): Promise<PriceSnapshot> {
  const priceUsd = await fetchHistoricalUsdPrice(asset, eventAt);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error(`Invalid ${asset} USD price for ${eventAt.toISOString()}`);
  }
  return findOrCreatePriceSnapshot({
    asset,
    eventAt,
    priceUsd,
    source: COINGECKO_SOURCE,
    sourceRef: `history:${Math.floor(eventAt.getTime() / 1000)}`,
  });
}

export function computeUsdValue(polAmount: number, usdRate: number): number {
  const value = polAmount * usdRate;
  return Math.round(value * 1e8) / 1e8;
}
