import { createHash } from "crypto";

/** Request fields that must not affect idempotency binding (rotates per page load). */
const EPHEMERAL_BODY_KEYS = new Set(["cfTurnstileToken"]);

/**
 * @param {unknown} body
 */
function cloneBodyWithoutEphemeral(body) {
  if (typeof body !== "object" || body === null) return body;
  const out = { .../** @type {Record<string, unknown>} */ (body) };
  for (const k of EPHEMERAL_BODY_KEYS) delete out[k];
  return out;
}

/**
 * Recursively sorts object keys for deterministic JSON hashing (replay protection).
 * @param {unknown} value
 * @returns {unknown}
 */
function sortKeysDeep(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v));
  if (typeof value !== "object") return value;
  /** @type {Record<string, unknown>} */
  const obj = /** @type {Record<string, unknown>} */ (value);
  const out = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = sortKeysDeep(obj[k]);
  }
  return out;
}

/**
 * Stable SHA-256 of the JSON body used to bind an idempotency key to a single intent.
 * @param {unknown} body
 * @returns {string} hex digest
 */
export function stableRequestHash(body) {
  let value = body;
  if (typeof body === "object" && body !== null && "body" in /** @type {any} */ (body)) {
    value = {
      .../** @type {any} */ (body),
      body: cloneBodyWithoutEphemeral(/** @type {any} */ (body).body),
    };
  }
  const normalized =
    typeof value === "object" && value !== null ? JSON.stringify(sortKeysDeep(value)) : String(value ?? "");
  return createHash("sha256").update(normalized).digest("hex");
}
