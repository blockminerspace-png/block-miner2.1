import crypto from "crypto";

function webhookUrl() {
  const u = String(process.env.INTERNAL_OFFERWALL_WEBHOOK_URL || "").trim();
  return u || null;
}

function webhookSecret() {
  return String(process.env.INTERNAL_OFFERWALL_WEBHOOK_SECRET || "").trim();
}

/**
 * Fire-and-forget completion webhook (self-claim or admin approval).
 * Never throws; logs only on unexpected errors.
 *
 * @param {object} payload
 * @param {string} payload.event
 * @param {number} payload.attemptId
 * @param {number} payload.userId
 * @param {number} payload.offerId
 * @param {string} payload.offerKind
 * @param {string} payload.completedAtIso
 */
export function notifyInternalOfferwallCompletion(payload) {
  const url = webhookUrl();
  if (!url) return;

  const body = JSON.stringify(payload);
  const secret = webhookSecret();
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "BlockMiner-InternalOfferwall/1"
  };
  if (secret) {
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    headers["X-BlockMiner-Signature"] = `sha256=${sig}`;
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  fetch(url, { method: "POST", headers, body, signal: ac.signal })
    .then(() => {})
    .catch((e) => {
      if (process.env.NODE_ENV !== "test") {
        console.warn("internalOfferwall webhook failed", e?.message || e);
      }
    })
    .finally(() => clearTimeout(t));
}
