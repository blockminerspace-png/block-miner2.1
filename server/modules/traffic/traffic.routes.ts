import express from "express";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import { recordPageView } from "./traffic.service.js";

export const trafficRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 30_000, max: 3 });

function sanitize(v: unknown, max = 255): string | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

trafficRouter.post("/hit", limiter, async (req, res) => {
  try {
    await recordPageView({
      path: sanitize(req.body?.path, 500) ?? "/",
      referrerDomain: sanitize(req.body?.referrerDomain),
      utmSource: sanitize(req.body?.utmSource),
      utmMedium: sanitize(req.body?.utmMedium),
      utmCampaign: sanitize(req.body?.utmCampaign),
    });
  } catch { /* best-effort */ }
  res.json({ ok: true });
});
