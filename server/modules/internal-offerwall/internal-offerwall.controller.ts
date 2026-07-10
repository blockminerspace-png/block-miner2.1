import type { Request, Response } from "express";
import {
  userAbandonAttempt,
  userListOffers,
  userMarkPartnerOpened,
  userStartOffer,
  userSubmitAttempt
} from "./internal-offerwall.service.js";
import { isInternalOfferwallEnabled } from "./internal-offerwall.config.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation
} from "../../utils/criticalMutationIdempotency.js";
import { logUserActivity } from "../../utils/logger.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("internal-offerwall.controller");

type IdempotencyLeaseHandle = { type: "lease"; leaseToken: string };

function asIdempotencyLease(lease: unknown): IdempotencyLeaseHandle {
  return lease as IdempotencyLeaseHandle;
}

function logSubmitErr(e: unknown, label: string) {
  const msg = e instanceof Error ? e.message : String(e);
  let code: string | undefined;
  let name: string | undefined;
  let meta: unknown;
  if (e !== null && typeof e === "object") {
    const o = e as { code?: unknown; name?: unknown; meta?: unknown };
    if (typeof o.code === "string") code = o.code;
    if (typeof o.name === "string") name = o.name;
    meta = o.meta;
  }
  logger.error(label, { message: msg, code, name, meta });
}

export async function getOffers(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const out = await userListOffers(userId);
    if (!out.ok) {
      res.status(403).json({ ok: false, code: out.code, offers: [], openAttempts: [] });
      return;
    }
    res.json({
      ok: true,
      dailyReset: "dailyReset" in out ? out.dailyReset : undefined,
      offers: out.offers,
      openAttempts: out.openAttempts,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("internalOfferwall getOffers", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Failed to load offers." });
  }
}

type OfferIdParams = { offerId: string };

export async function postStart(req: Request<OfferIdParams>, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const offerId = parseInt(String(req.params.offerId || ""), 10);
    if (!Number.isInteger(offerId) || offerId < 1) {
      res.status(400).json({ ok: false, message: "Invalid offer id." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userStartOffer(userId, offerId);
      if (!out.ok) {
        await cancelCriticalMutation(asIdempotencyLease(lease));
        const payload: {
          ok: false;
          code: string;
          message: string;
          messageKey?: string;
          secondsUntilReset?: number;
        } = {
          ok: false,
          code: "code" in out && typeof out.code === "string" ? out.code : "ERROR",
          message: "message" in out && typeof out.message === "string" ? out.message : "Failed."
        };
        if ("messageKey" in out && typeof out.messageKey === "string") payload.messageKey = out.messageKey;
        if ("secondsUntilReset" in out && typeof out.secondsUntilReset === "number") {
          payload.secondsUntilReset = out.secondsUntilReset;
        }
        res.status("status" in out && typeof out.status === "number" ? out.status : 500).json(payload);
        return;
      }
      if (!("attempt" in out) || out.attempt == null) {
        await cancelCriticalMutation(asIdempotencyLease(lease));
        res.status(500).json({ ok: false, message: "Failed to start offer." });
        return;
      }
      const okPayload = { ok: true as const, attempt: out.attempt };
      await finalizeCriticalMutationSuccess(asIdempotencyLease(lease), {
        requestHash: ci.requestHash,
        responseJson: okPayload
      });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(asIdempotencyLease(lease));
      const msg = inner instanceof Error ? inner.message : String(inner);
      logger.error("internalOfferwall postStart", { error: String(msg) });
      res.status(500).json({ ok: false, message: "Failed to start offer." });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("internalOfferwall postStart", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Failed to start offer." });
  }
}

type AttemptIdParams = { attemptId: string };

export async function postPartnerOpened(req: Request<AttemptIdParams>, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const attemptId = parseInt(String(req.params.attemptId || ""), 10);
    if (!Number.isInteger(attemptId) || attemptId < 1) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userMarkPartnerOpened(userId, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(asIdempotencyLease(lease));
        res.status(typeof out.status === "number" ? out.status : 500).json({
          ok: false,
          code: out.code,
          message: out.message
        });
        return;
      }
      const okPayload = { ok: true as const, partnerOpenedAt: out.partnerOpenedAt };
      await finalizeCriticalMutationSuccess(asIdempotencyLease(lease), {
        requestHash: ci.requestHash,
        responseJson: okPayload
      });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(asIdempotencyLease(lease));
      const msg = inner instanceof Error ? inner.message : String(inner);
      logger.error("internalOfferwall postPartnerOpened", { error: String(msg) });
      res.status(500).json({ ok: false, message: "Failed to record partner open." });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("internalOfferwall postPartnerOpened", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Failed to record partner open." });
  }
}

export async function postAbandon(req: Request<AttemptIdParams>, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const attemptId = parseInt(String(req.params.attemptId || ""), 10);
    if (!Number.isInteger(attemptId) || attemptId < 1) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userAbandonAttempt(userId, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(asIdempotencyLease(lease));
        res.status(typeof out.status === "number" ? out.status : 500).json({
          ok: false,
          code: out.code,
          message: out.message
        });
        return;
      }
      const okPayload = {
        ok: true as const,
        alreadyCleared: Boolean(out.alreadyCleared),
        deleted: out.deleted === true
      };
      await finalizeCriticalMutationSuccess(asIdempotencyLease(lease), {
        requestHash: ci.requestHash,
        responseJson: okPayload
      });
      logUserActivity("OFFERWALL_ATTEMPT_ABANDONED", req, { attemptId });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(asIdempotencyLease(lease));
      const msg = inner instanceof Error ? inner.message : String(inner);
      logger.error("internalOfferwall postAbandon", { error: String(msg) });
      res.status(500).json({ ok: false, message: "Failed to abandon attempt." });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("internalOfferwall postAbandon", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Failed to abandon attempt." });
  }
}

export async function postSubmit(req: Request<AttemptIdParams>, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const attemptId = parseInt(String(req.params.attemptId || ""), 10);
    if (!Number.isInteger(attemptId) || attemptId < 1) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userSubmitAttempt(userId, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(asIdempotencyLease(lease));
        res.status(typeof out.status === "number" ? out.status : 500).json({
          ok: false,
          code: out.code,
          message: out.message
        });
        return;
      }
      const okPayload = { ok: true as const, status: out.status, message: out.message };
      await finalizeCriticalMutationSuccess(asIdempotencyLease(lease), {
        requestHash: ci.requestHash,
        responseJson: okPayload
      });
      logUserActivity("OFFERWALL_ATTEMPT_SUBMITTED", req, { attemptId, status: String(out.status) });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(asIdempotencyLease(lease));
      logSubmitErr(inner, "internalOfferwall postSubmit");
      res.status(500).json({ ok: false, message: "Failed to submit attempt." });
    }
  } catch (e: unknown) {
    logSubmitErr(e, "internalOfferwall postSubmit");
    res.status(500).json({ ok: false, message: "Failed to submit attempt." });
  }
}

export function getFeatureStatus(_req: Request, res: Response): void {
  res.json({ ok: true, enabled: isInternalOfferwallEnabled() });
}
