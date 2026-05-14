import type { Request, Response } from "express";
import {
  abortIdempotencyLease,
  beginIdempotencyLease,
  commitIdempotencyResult
} from "../services/idempotencyService.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "./securityErrors.js";
import { logSecurityEvent } from "./securityLogger.js";
import { isIdempotencyLease, type IdempotencyLease } from "../types/idempotencyLease.js";

/** Lease object from `beginIdempotencyLease` (includes optional internal bookkeeping). */
export type ResolvedIdempotencyLease = IdempotencyLease & { _mem?: unknown; _pg?: unknown };

export type CriticalIdempotencyContext = {
  scope: string;
  idempotencyKey: string;
  requestHash: string;
};

export type ResolveCriticalMutationResult = {
  lease: ResolvedIdempotencyLease;
  ci: CriticalIdempotencyContext;
};

export async function resolveCriticalMutation(
  req: Request,
  res: Response
): Promise<ResolveCriticalMutationResult | null> {
  const ci = req.criticalIdempotency;
  if (!ci?.scope || !ci.idempotencyKey || !ci.requestHash) {
    res.status(500).json({ ok: false, message: "Idempotency middleware is not configured for this route." });
    return null;
  }
  if (req.user == null) {
    res.status(401).json({ ok: false, message: "Unauthorized." });
    return null;
  }
  const userId = req.user.id;

  const phase = await beginIdempotencyLease({
    scope: ci.scope,
    userId,
    idempotencyKey: ci.idempotencyKey,
    requestHash: ci.requestHash
  });

  if (phase.type === "mismatch") {
    logSecurityEvent("IDEMPOTENCY_REQUEST_MISMATCH", { scope: ci.scope, userId }, req);
    res.status(400).json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_REQUEST_SIGNATURE));
    return null;
  }
  if (phase.type === "busy") {
    logSecurityEvent("IDEMPOTENCY_LEASE_BUSY", { scope: ci.scope, userId }, req);
    res
      .status(409)
      .json(
        buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED, {
          extra: { reason: "IDEMPOTENCY_IN_FLIGHT" }
        })
      );
    return null;
  }
  if (phase.type === "replay") {
    logSecurityEvent("IDEMPOTENCY_REPLAY", { scope: ci.scope, userId }, req);
    res.status(200).json(phase.responseJson);
    return null;
  }

  if (!isIdempotencyLease(phase)) {
    res.status(500).json({ ok: false, message: "Invalid idempotency lease state." });
    return null;
  }

  return { lease: phase, ci };
}

export async function finalizeCriticalMutationSuccess(
  lease: ResolvedIdempotencyLease,
  payload: { requestHash: string; responseJson: object }
): Promise<void> {
  await commitIdempotencyResult(lease, payload);
}

export async function cancelCriticalMutation(lease: ResolvedIdempotencyLease | null | undefined): Promise<void> {
  if (lease && lease.type === "lease") {
    await abortIdempotencyLease(lease);
  }
}
