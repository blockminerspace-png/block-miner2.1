/**
 * Stable stack key for grouping identical machines (inventory or vault rows).
 * Normalizes API/JSON quirks (string numbers, float noise, name casing) so duplicates stack in UI.
 */
type StackKeyRow = {
  minerName?: string | null;
  level?: number | null;
  hashRate?: string | number | null;
  slotSize?: number | null;
  minerId?: number | null;
};

function normName(row: StackKeyRow | null | undefined): string {
  return String(row?.minerName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normHashRate(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

export function inventoryStackKey(row: StackKeyRow | null | undefined): string {
  const name = normName(row);
  const level = normInt(row?.level, 0);
  const slot = normInt(row?.slotSize, 1) || 1;
  const hr = normHashRate(row?.hashRate);
  const midRaw = Number(row?.minerId);
  const mid = Number.isInteger(midRaw) && midRaw > 0 ? midRaw : 0;
  return `${name}|${level}|${hr}|${slot}|${mid}`;
}
