import { getSharedPolygonProvider } from "../../../../services/polygonProvider.js";

/**
 * Resolves canonical on-chain block timestamp (UTC). Called once at deposit confirmation.
 */
export async function resolveBlockTimestamp(blockNumber: number): Promise<Date> {
  const provider = getSharedPolygonProvider();
  const block = await provider.getBlock(blockNumber);
  if (!block?.timestamp) {
    throw new Error(`Block ${blockNumber} timestamp unavailable`);
  }
  return new Date(Number(block.timestamp) * 1000);
}
