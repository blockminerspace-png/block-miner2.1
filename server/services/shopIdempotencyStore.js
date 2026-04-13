/**
 * In-process idempotency cache for shop purchases (same Node process).
 * For horizontally scaled deployments, replace with a shared store (e.g. Redis) without changing call sites.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_KEYS = 5000;

/** @type {Map<string, { createdAt: number, payload: object }>} */
const store = new Map();

function maxKeys() {
  const n = Number(process.env.SHOP_IDEMPOTENCY_MAX_KEYS || DEFAULT_MAX_KEYS);
  return Number.isFinite(n) && n > 100 ? Math.floor(n) : DEFAULT_MAX_KEYS;
}

function ttlMs() {
  const n = Number(process.env.SHOP_IDEMPOTENCY_TTL_MS || DEFAULT_TTL_MS);
  return Number.isFinite(n) && n > 60_000 ? Math.floor(n) : DEFAULT_TTL_MS;
}

function compositeKey(userId, idempotencyKey) {
  return `${userId}::${idempotencyKey}`;
}

function pruneIfNeeded() {
  const limit = maxKeys();
  if (store.size <= limit) return;
  const entries = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const drop = entries.length - limit;
  for (let i = 0; i < drop; i += 1) {
    store.delete(entries[i][0]);
  }
}

/**
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
export function normalizeShopIdempotencyKey(key) {
  if (key == null) return null;
  const s = String(key).trim();
  if (!s) return null;
  if (s.length > 128 || s.length < 8) return null;
  // UUIDs and Stripe-style keys: alphanumerics, hyphen, underscore, dot
  if (!/^[0-9a-zA-Z._-]+$/.test(s)) return null;
  return s;
}

/**
 * @param {number} userId
 * @param {string} idempotencyKey normalized
 * @returns {object | null} cached JSON-safe payload for API replay
 */
export function getShopIdempotencyPayload(userId, idempotencyKey) {
  const ck = compositeKey(userId, idempotencyKey);
  const hit = store.get(ck);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > ttlMs()) {
    store.delete(ck);
    return null;
  }
  return hit.payload ? { ...hit.payload } : null;
}

/**
 * @param {number} userId
 * @param {string} idempotencyKey normalized
 * @param {object} payload must be JSON-serializable (plain data for replay response)
 */
export function setShopIdempotencyPayload(userId, idempotencyKey, payload) {
  const ck = compositeKey(userId, idempotencyKey);
  store.set(ck, { createdAt: Date.now(), payload: { ...payload } });
  pruneIfNeeded();
}

/** Test helper */
export function __resetShopIdempotencyStoreForTests() {
  store.clear();
}
