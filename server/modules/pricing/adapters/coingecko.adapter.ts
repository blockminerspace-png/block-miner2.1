import { getPolUsdPriceAt } from "../../../utils/cryptoPrice.js";
import type { AssetCode } from "../types.js";

export async function fetchHistoricalUsdPrice(asset: AssetCode, eventAt: Date): Promise<number> {
  if (asset !== "POL") {
    throw new Error(`Unsupported asset for historical price: ${asset}`);
  }
  const timestampSec = Math.floor(eventAt.getTime() / 1000);
  return getPolUsdPriceAt(timestampSec);
}
