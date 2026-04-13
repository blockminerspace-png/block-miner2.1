/**
 * Stable stack key for grouping identical machines (inventory or vault rows).
 * @param {{ minerName?: string | null; level?: number | null; hashRate?: number | null; slotSize?: number | null; minerId?: number | null }} row
 */
export function inventoryStackKey(row) {
  const name = row?.minerName ?? "";
  const level = row?.level ?? 0;
  const hr = row?.hashRate ?? 0;
  const slot = row?.slotSize ?? 0;
  const mid = row?.minerId ?? "";
  return `${name}_${level}_${hr}_${slot}_${mid}`;
}
