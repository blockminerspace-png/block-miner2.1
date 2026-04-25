/**
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
export function normalizeIdempotencyKey(key) {
  if (key == null) return null;
  const s = String(key).trim();
  if (!s) return null;
  if (s.length > 128 || s.length < 8) return null;
  if (!/^[0-9a-zA-Z._-]+$/.test(s)) return null;
  return s;
}
