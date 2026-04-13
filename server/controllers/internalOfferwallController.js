import {
  userListOffers,
  userMarkPartnerOpened,
  userStartOffer,
  userSubmitAttempt
} from "../services/internalOfferwall/internalOfferwallService.js";
import { isInternalOfferwallEnabled } from "../services/internalOfferwall/internalOfferwallFeature.js";

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
    const out = await userStartOffer(userId, offerId);
    if (!out.ok) {
      const payload = { ok: false, code: out.code, message: out.message };
      if (out.messageKey) payload.messageKey = out.messageKey;
      if (out.secondsUntilReset != null) payload.secondsUntilReset = out.secondsUntilReset;
      return res.status(out.status).json(payload);
    }
    res.json({ ok: true, attempt: out.attempt });
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
    const out = await userMarkPartnerOpened(userId, attemptId);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, code: out.code, message: out.message });
    }
    res.json({ ok: true, partnerOpenedAt: out.partnerOpenedAt });
  } catch (e) {
    console.error("internalOfferwall postPartnerOpened", e);
    res.status(500).json({ ok: false, message: "Failed to record partner open." });
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
    const out = await userSubmitAttempt(userId, attemptId);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, code: out.code, message: out.message });
    }
    res.json({
      ok: true,
      status: out.status,
      message: out.message
    });
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
