import type { NextFunction, Request, RequestHandler, Response } from "express";
import { normalizeIdempotencyKey } from "../utils/normalizeIdempotencyKey.js";
import { stableRequestHash } from "../utils/stableRequestHash.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";

export type CriticalIdempotencyOptions = {
  scope: string;
};

export function requireCriticalIdempotency(opts: CriticalIdempotencyOptions): RequestHandler {
  const scope = String(opts.scope || "critical");
  return function criticalIdempotency(req: Request, res: Response, next: NextFunction): void {
    const raw = req.get("Idempotency-Key") || req.get("idempotency-key") || req.body?.idempotencyKey;
    const idempotencyKey = normalizeIdempotencyKey(raw);
    if (raw != null && String(raw).trim() !== "" && !idempotencyKey) {
      res
        .status(400)
        .json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "idempotencyKey" } }));
      return;
    }
    if (!idempotencyKey) {
      res
        .status(400)
        .json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "idempotencyKey" } }));
      return;
    }
    const requestHash = stableRequestHash({
      body: req.body,
      params: req.params,
      path: req.path,
    });
    req.criticalIdempotency = { scope, idempotencyKey, requestHash };
    next();
  };
}
