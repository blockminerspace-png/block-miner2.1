/**
 * Owned-machine image resolution: current catalog first, then per-instance snapshot, never stock placeholders as truth.
 */

export type OwnedMachineImageSource = "owned_snapshot" | "catalog_current" | "none";

const STOCK_PLACEHOLDER_PATHS = new Set([
  "/icon.png",
]);

function trimUrl(url: string | null | undefined): string {
  return typeof url === "string" ? url.trim() : "";
}

export function isStockPlaceholderMinerImageUrl(url: string | null | undefined): boolean {
  const t = trimUrl(url);
  if (!t) return false;
  const pathOnly = t.split("?")[0]?.toLowerCase() ?? "";
  return STOCK_PLACEHOLDER_PATHS.has(pathOnly);
}

/** Value safe to persist on UserOwnedMachine / inventory / rack rows (null if empty or stock placeholder). */
export function normalizePersistableMinerImageUrl(url: string | null | undefined): string | null {
  const t = trimUrl(url);
  if (!t || isStockPlaceholderMinerImageUrl(t)) return null;
  return t;
}

function firstRealImage(...urls: Array<string | null | undefined>): string | null {
  for (const u of urls) {
    const t = trimUrl(u);
    if (t && !isStockPlaceholderMinerImageUrl(t)) return t;
  }
  return null;
}

export function resolveOwnedMachineImageUrl(input: {
  rowImageUrl?: string | null;
  ownedMachineImageUrl?: string | null;
  catalogImageUrl?: string | null;
  /** Live image from `event_miners` when row name is `[Event] …` and miner_id is null. */
  eventCatalogImageUrl?: string | null;
}): { imageUrl: string | null; imageSource: OwnedMachineImageSource } {
  const catalog = firstRealImage(input.catalogImageUrl, input.eventCatalogImageUrl);
  if (catalog) {
    return { imageUrl: catalog, imageSource: "catalog_current" };
  }
  const snapshot = firstRealImage(input.ownedMachineImageUrl, input.rowImageUrl);
  if (snapshot) {
    return { imageUrl: snapshot, imageSource: "owned_snapshot" };
  }
  return { imageUrl: null, imageSource: "none" };
}

/** Drop stale per-instance URLs so catalog updates propagate to all owners. */
export async function clearCatalogLinkedMachineImageSnapshots(
  prisma: import("@prisma/client").PrismaClient,
  minerId: number,
): Promise<void> {
  const where = { minerId };
  const data = { imageUrl: null };
  await Promise.all([
    prisma.userOwnedMachine.updateMany({ where, data }),
    prisma.userInventory.updateMany({ where, data }),
    prisma.userMiner.updateMany({ where, data }),
    prisma.userVault.updateMany({ where, data }),
  ]);
}

/** Drop stale snapshots for `[Event] {name}` rows so EventMiner catalog image is used. */
export async function clearEventMinerOwnedImageSnapshots(
  prisma: import("@prisma/client").PrismaClient,
  eventMinerDisplayName: string,
): Promise<void> {
  const label = String(eventMinerDisplayName ?? "").trim();
  if (!label) return;
  const minerName = `[Event] ${label}`;
  const where = { minerId: null, minerName };
  const data = { imageUrl: null };

  const ownedRows = await prisma.userOwnedMachine.findMany({
    where,
    select: { id: true },
  });
  const ownedIds = ownedRows.map((r) => r.id);

  await Promise.all([
    prisma.userOwnedMachine.updateMany({ where, data }),
    prisma.userInventory.updateMany({ where, data }),
    prisma.userVault.updateMany({ where, data }),
    ownedIds.length > 0
      ? prisma.userMiner.updateMany({
          where: { ownedMachineId: { in: ownedIds } },
          data,
        })
      : Promise.resolve({ count: 0 }),
  ]);
}

export type OwnedMachineImageDto = {
  imageUrl: string | null;
  imageSource: OwnedMachineImageSource;
};

export function toOwnedMachineImageDto(input: {
  rowImageUrl?: string | null;
  ownedMachineImageUrl?: string | null;
  catalogImageUrl?: string | null;
}): OwnedMachineImageDto {
  return resolveOwnedMachineImageUrl(input);
}
