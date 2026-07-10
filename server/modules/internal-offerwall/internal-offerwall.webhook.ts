import crypto from "crypto";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("internal-offerwall.webhook");

function webhookUrl(): string | null {
  const u = String(process.env.INTERNAL_OFFERWALL_WEBHOOK_URL || "").trim();
  return u || null;
}

function webhookSecret(): string {
  return String(process.env.INTERNAL_OFFERWALL_WEBHOOK_SECRET || "").trim();
}

export function notifyInternalOfferwallCompletion(payload: {
  event: string;
  attemptId: number;
  userId: number;
  offerId: number;
  offerKind: string;
  completedAtIso: string;
}): void {
  const url = webhookUrl();
  if (!url) return;

  const body = JSON.stringify(payload);
  const secret = webhookSecret();
  const headers: Record<string, string> = {
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
        logger.warn("internalOfferwall webhook failed", { error: (e as Error)?.message || String(e) });
      }
    })
    .finally(() => clearTimeout(t));
}
