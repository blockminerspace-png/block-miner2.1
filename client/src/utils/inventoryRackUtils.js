/**
 * One UserMiner must only be uninstalled once per rack dismantle (avoids duplicate inventory rows).
 */
export function dedupeOccupiedSlotsForDismantle(slots) {
  const seenMinerIds = new Set();
  const out = [];
  for (const s of slots || []) {
    if (!s?.miner || !Number.isInteger(s.id)) continue;
    const mid = s.miner.id;
    if (mid == null || seenMinerIds.has(mid)) continue;
    seenMinerIds.add(mid);
    out.push(s);
  }
  return out;
}
