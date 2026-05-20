/**
 * Client-side owned-machine image resolution (mirrors server/utils/ownedMachineImage.ts).
 */

export type MachineImageSource = "owned_snapshot" | "catalog_current" | "none";

const STOCK_PLACEHOLDER_PATHS = new Set([
  "/machines/reward1.png",
  "/machines/reward2.png",
  "/machines/reward3.png",
  "/machines/1.png",
  "/machines/2.png",
  "/machines/3.png",
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
  eventCatalogImageUrl?: string | null;
  /** When API already resolved imageUrl + imageSource, prefer those. */
  apiImageUrl?: string | null;
  apiImageSource?: MachineImageSource;
}): { imageUrl: string | null; imageSource: MachineImageSource } {
  if (input.apiImageSource && input.apiImageUrl !== undefined) {
    const apiUrl = trimUrl(input.apiImageUrl);
    if (apiUrl && !isStockPlaceholderMinerImageUrl(apiUrl)) {
      return { imageUrl: apiUrl, imageSource: input.apiImageSource };
    }
    if (input.apiImageSource === "none") {
      return { imageUrl: null, imageSource: "none" };
    }
  }

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

/** Read imageUrl from a loose machine/inventory/rack row. */
export function readMachineRowImageUrl(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const raw = row.imageUrl ?? row.image_url;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || isStockPlaceholderMinerImageUrl(t)) return null;
  return t;
}
