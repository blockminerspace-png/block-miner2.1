import {
  abortIdempotencyLease,
  beginIdempotencyLease,
  commitIdempotencyResult,
} from "../services/idempotencyService.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "./securityErrors.js";
import { logSecurityEvent } from "./securityLogger.js";

/**
 * Begins a replay-safe mutation: replays prior success, rejects mismatched payloads, or returns a lease.
 * When this returns null, the response has already been sent.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<{ lease: object; ci: { scope: string; idempotencyKey: string; requestHash: string } } | null>}
 */
export async function resolveCriticalMutation(req, res) {
  const ci = req.criticalIdempotency;
  if (!ci?.scope || !ci.idempotencyKey || !ci.requestHash) {
    res.status(500).json({ ok: false, message: "Idempotency middleware is not configured for this route." });
    return null;
  }
  const phase = await beginIdempotencyLease({
    scope: ci.scope,
    userId: req.user.id,
    idempotencyKey: ci.idempotencyKey,
    requestHash: ci.requestHash,
  });
  if (phase.type === "mismatch") {
    logSecurityEvent(
      "IDEMPOTENCY_REQUEST_MISMATCH",
      { scope: ci.scope, userId: req.user.id },
      req,
    );
    res.status(400).json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_REQUEST_SIGNATURE));
    return null;
  }
  if (phase.type === "busy") {
    logSecurityEvent(
      "IDEMPOTENCY_LEASE_BUSY",
      { scope: ci.scope, userId: req.user.id },
      req,
    );
    res
      .status(409)
      .json(
        buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED, {
          extra: { reason: "IDEMPOTENCY_IN_FLIGHT" },
        }),
      );
    return null;
  }
  if (phase.type === "replay") {
    logSecurityEvent(
      "IDEMPOTENCY_REPLAY",
      { scope: ci.scope, userId: req.user.id },
      req,
    );
    res.status(200).json(phase.responseJson);
    return null;
  }
  return { lease: phase, ci };
}

/**
 * @param {import("../services/idempotencyService.js").Lease} lease
 * @param {{ requestHash: string; responseJson: object }} payload
 */
export async function finalizeCriticalMutationSuccess(lease, payload) {
  await commitIdempotencyResult(lease, payload);
}

/**
 * @param {import("../services/idempotencyService.js").Lease | null | undefined} lease
 */
export async function cancelCriticalMutation(lease) {
  if (lease && lease.type === "lease") {
    await abortIdempotencyLease(lease);
  }
}
