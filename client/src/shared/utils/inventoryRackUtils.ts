/**
 * One UserMiner must only be uninstalled once per rack dismantle (avoids duplicate inventory rows).
 */
type OccupiedSlot = {
  id?: unknown;
  miner?: { id?: unknown } | null;
};

export function dedupeOccupiedSlotsForDismantle(
  slots: readonly OccupiedSlot[] | null | undefined,
): OccupiedSlot[] {
  const seenMinerIds = new Set<unknown>();
  const out: OccupiedSlot[] = [];
  for (const s of slots || []) {
    const sid = Number(s.id);
    if (!s?.miner || !Number.isInteger(sid)) continue;
    const mid = s.miner.id;
    if (mid == null || seenMinerIds.has(mid)) continue;
    seenMinerIds.add(mid);
    out.push(s);
  }
  return out;
}
