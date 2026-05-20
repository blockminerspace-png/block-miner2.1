import prisma from "../src/db/prisma.js";
import { normalizePersistableMinerImageUrl } from "./ownedMachineImage.js";

const EVENT_PREFIX_RE = /^\[event\]\s*/i;

export function parseEventMinerDisplayName(minerName: string | null | undefined): string | null {
  const raw = String(minerName ?? "").trim();
  if (!raw || !EVENT_PREFIX_RE.test(raw)) return null;
  const name = raw.replace(EVENT_PREFIX_RE, "").trim();
  return name || null;
}

function normEventName(name: string): string {
  return name.trim().toLowerCase();
}

/** Latest EventMiner.imageUrl per display name (for owned rows without catalog miner_id). */
export async function loadEventMinerCatalogImageMap(
  displayNames: Iterable<string>,
): Promise<Map<string, string | null>> {
  const wanted = new Set<string>();
  for (const n of displayNames) {
    const t = String(n ?? "").trim();
    if (t) wanted.add(normEventName(t));
  }
  const out = new Map<string, string | null>();
  if (wanted.size === 0) return out;

  const rows = await prisma.eventMiner.findMany({
    where: {
      OR: [...wanted].map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    },
    select: { name: true, imageUrl: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  for (const row of rows) {
    const key = normEventName(row.name);
    if (out.has(key)) continue;
    out.set(key, normalizePersistableMinerImageUrl(row.imageUrl));
  }
  return out;
}

export function eventCatalogImageFromMap(
  map: Map<string, string | null>,
  minerName: string | null | undefined,
): string | null {
  const label = parseEventMinerDisplayName(minerName);
  if (!label) return null;
  return map.get(normEventName(label)) ?? null;
}

export function collectEventMinerDisplayNames(
  rows: Iterable<{ minerId?: number | null; minerName?: string | null }>,
): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.minerId != null && Number(row.minerId) > 0) continue;
    const label = parseEventMinerDisplayName(row.minerName);
    if (label) names.add(label);
  }
  return [...names];
}

/** Miner catalog image by display name (for rows missing miner_id or stale links). */
export async function loadMinerCatalogImageMapByDisplayNames(
  displayNames: Iterable<string>,
): Promise<Map<string, string | null>> {
  const wanted = new Set<string>();
  for (const n of displayNames) {
    const raw = String(n ?? "").trim();
    if (!raw || EVENT_PREFIX_RE.test(raw)) continue;
    wanted.add(normEventName(raw));
  }
  const out = new Map<string, string | null>();
  if (wanted.size === 0) return out;

  const rows = await prisma.miner.findMany({
    where: {
      OR: [...wanted].map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    },
    select: { name: true, imageUrl: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  for (const row of rows) {
    const key = normEventName(row.name);
    if (out.has(key)) continue;
    out.set(key, normalizePersistableMinerImageUrl(row.imageUrl));
  }
  return out;
}

export function minerCatalogImageFromMap(
  map: Map<string, string | null>,
  minerName: string | null | undefined,
): string | null {
  const raw = String(minerName ?? "").trim();
  if (!raw || EVENT_PREFIX_RE.test(raw)) return null;
  return map.get(normEventName(raw)) ?? null;
}

export function collectCatalogLookupDisplayNames(
  rows: Iterable<{ minerId?: number | null; minerName?: string | null }>,
): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const raw = String(row.minerName ?? "").trim();
    if (!raw) continue;
    const eventLabel = parseEventMinerDisplayName(raw);
    if (eventLabel) names.add(eventLabel);
    else names.add(raw);
  }
  return [...names];
}
