import _prisma from "../../../src/db/prisma.js";
import type { AssetCode, PriceSnapshot } from "../types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function toSnapshot(row: {
  id: number;
  asset: string;
  eventAt: Date;
  priceUsd: unknown;
  source: string;
  sourceRef: string | null;
}): PriceSnapshot {
  return {
    id: row.id,
    asset: row.asset as AssetCode,
    eventAt: row.eventAt,
    priceUsd: Number(row.priceUsd),
    source: row.source,
    sourceRef: row.sourceRef,
  };
}

export async function findPriceSnapshot(
  asset: AssetCode,
  eventAt: Date,
): Promise<PriceSnapshot | null> {
  const row = await prisma.assetPriceSnapshot.findUnique({
    where: { asset_eventAt: { asset, eventAt } },
  });
  return row ? toSnapshot(row) : null;
}

export async function createPriceSnapshot(input: {
  asset: AssetCode;
  eventAt: Date;
  priceUsd: number;
  source: string;
  sourceRef?: string | null;
}): Promise<PriceSnapshot> {
  const row = await prisma.assetPriceSnapshot.create({
    data: {
      asset: input.asset,
      eventAt: input.eventAt,
      priceUsd: input.priceUsd.toString(),
      source: input.source,
      sourceRef: input.sourceRef ?? null,
    },
  });
  return toSnapshot(row);
}

export async function findOrCreatePriceSnapshot(input: {
  asset: AssetCode;
  eventAt: Date;
  priceUsd: number;
  source: string;
  sourceRef?: string | null;
}): Promise<PriceSnapshot> {
  const existing = await findPriceSnapshot(input.asset, input.eventAt);
  if (existing) return existing;
  try {
    return await createPriceSnapshot(input);
  } catch {
    const again = await findPriceSnapshot(input.asset, input.eventAt);
    if (again) return again;
    throw new Error("Failed to create price snapshot");
  }
}
