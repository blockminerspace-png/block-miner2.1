import {
  userAbandonAttempt,
  userListOffers,
  userMarkPartnerOpened,
  userStartOffer,
  userSubmitAttempt
} from "../services/internalOfferwall/internalOfferwallService.js";
import { isInternalOfferwallEnabled } from "../services/internalOfferwall/internalOfferwallFeature.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../utils/criticalMutationIdempotency.js";
import { logUserActivity } from "../utils/logger.js";

export async function getOffers(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }
    const out = await userListOffers(userId);
    if (!out.ok) {
      return res.status(403).json({ ok: false, code: out.code, offers: [], openAttempts: [] });
    }
    res.json({ ok: true, offers: out.offers, openAttempts: out.openAttempts });
  } catch (e) {
    console.error("internalOfferwall getOffers", e);
    res.status(500).json({ ok: false, message: "Failed to load offers." });
  }
}

export async function postStart(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }
    const offerId = parseInt(String(req.params.offerId || ""), 10);
    if (!Number.isInteger(offerId) || offerId < 1) {
      return res.status(400).json({ ok: false, message: "Invalid offer id." });
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userStartOffer(userId, offerId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        const payload = { ok: false, code: out.code, message: out.message };
        if (out.messageKey) payload.messageKey = out.messageKey;
        if (out.secondsUntilReset != null) payload.secondsUntilReset = out.secondsUntilReset;
        return res.status(out.status).json(payload);
      }
      const okPayload = { ok: true, attempt: out.attempt };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      return res.json(okPayload);
    } catch (e) {
      await cancelCriticalMutation(lease);
      console.error("internalOfferwall postStart", e);
      return res.status(500).json({ ok: false, message: "Failed to start offer." });
    }
  } catch (e) {
    console.error("internalOfferwall postStart", e);
    res.status(500).json({ ok: false, message: "Failed to start offer." });
  }
}

export async function postPartnerOpened(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }
    const attemptId = parseInt(String(req.params.attemptId || ""), 10);
    if (!Number.isInteger(attemptId) || attemptId < 1) {
      return res.status(400).json({ ok: false, message: "Invalid attempt id." });
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userMarkPartnerOpened(userId, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        return res.status(out.status).json({ ok: false, code: out.code, message: out.message });
      }
      const okPayload = { ok: true, partnerOpenedAt: out.partnerOpenedAt };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      return res.json(okPayload);
    } catch (e) {
      await cancelCriticalMutation(lease);
      console.error("internalOfferwall postPartnerOpened", e);
      return res.status(500).json({ ok: false, message: "Failed to record partner open." });
    }
  } catch (e) {
    console.error("internalOfferwall postPartnerOpened", e);
    res.status(500).json({ ok: false, message: "Failed to record partner open." });
  }
}

export async function postAbandon(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }
    const attemptId = parseInt(String(req.params.attemptId || ""), 10);
    if (!Number.isInteger(attemptId) || attemptId < 1) {
      return res.status(400).json({ ok: false, message: "Invalid attempt id." });
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userAbandonAttempt(userId, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        return res.status(out.status).json({ ok: false, code: out.code, message: out.message });
      }
      const okPayload = {
        ok: true,
        alreadyCleared: Boolean(out.alreadyCleared),
        deleted: out.deleted === true
      };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      logUserActivity("OFFERWALL_ATTEMPT_ABANDONED", req, { attemptId });
      return res.json(okPayload);
    } catch (e) {
      await cancelCriticalMutation(lease);
      console.error("internalOfferwall postAbandon", e);
      return res.status(500).json({ ok: false, message: "Failed to abandon attempt." });
    }
  } catch (e) {
    console.error("internalOfferwall postAbandon", e);
    res.status(500).json({ ok: false, message: "Failed to abandon attempt." });
  }
}

export async function postSubmit(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }
    const attemptId = parseInt(String(req.params.attemptId || ""), 10);
    if (!Number.isInteger(attemptId) || attemptId < 1) {
      return res.status(400).json({ ok: false, message: "Invalid attempt id." });
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await userSubmitAttempt(userId, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        return res.status(out.status).json({ ok: false, code: out.code, message: out.message });
      }
      const okPayload = {
        ok: true,
        status: out.status,
        message: out.message,
      };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      logUserActivity("OFFERWALL_ATTEMPT_SUBMITTED", req, { attemptId, status: out.status });
      return res.json(okPayload);
    } catch (e) {
      await cancelCriticalMutation(lease);
      console.error("internalOfferwall postSubmit", {
        message: e?.message,
        code: e?.code,
        name: e?.name,
        meta: e?.meta
      });
      return res.status(500).json({ ok: false, message: "Failed to submit attempt." });
    }
  } catch (e) {
    console.error("internalOfferwall postSubmit", {
      message: e?.message,
      code: e?.code,
      name: e?.name,
      meta: e?.meta
    });
    res.status(500).json({ ok: false, message: "Failed to submit attempt." });
  }
}

/** Public feature flag for SPA (no auth). */
export function getFeatureStatus(_req, res) {
  res.json({ ok: true, enabled: isInternalOfferwallEnabled() });
}
