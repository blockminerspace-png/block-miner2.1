/**
 * Validates Idempotency-Key for replay-safe mutations and binds the request body via a stable hash.
 */

import { normalizeIdempotencyKey } from "../utils/normalizeIdempotencyKey.js";
import { stableRequestHash } from "../utils/stableRequestHash.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";

/**
 * @param {{ scope: string }} opts
 * @returns {import("express").RequestHandler}
 */
export function requireCriticalIdempotency(opts) {
  const scope = String(opts.scope || "critical");
  return function criticalIdempotency(req, res, next) {
    const raw = req.get("Idempotency-Key") || req.get("idempotency-key") || req.body?.idempotencyKey;
    const idempotencyKey = normalizeIdempotencyKey(raw);
    if (raw != null && String(raw).trim() !== "" && !idempotencyKey) {
      return res
        .status(400)
        .json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "idempotencyKey" } }));
    }
    if (!idempotencyKey) {
      return res
        .status(400)
        .json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "idempotencyKey" } }));
    }
    // Bind idempotency to URL params as well (many routes encode ids only in the path).
    const requestHash = stableRequestHash({
      body: req.body,
      params: req.params,
      path: req.path,
    });
    req.criticalIdempotency = { scope, idempotencyKey, requestHash };
    next();
  };
}
