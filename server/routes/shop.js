import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createDistributedRateLimiter } from "../middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../middleware/criticalIdempotency.js";
import { requireTurnstileWhenConfigured } from "../middleware/turnstile.js";
import { getRequestIp } from "../utils/clientIp.js";
import * as shopController from "../controllers/shopController.js";

export const shopRouter = express.Router();
const shopLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 10,
  name: "shop_purchase",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

shopRouter.get("/miners", requireAuth, shopController.listMiners);
shopRouter.post(
  "/purchase",
  requireAuth,
  shopLimiter,
  requireTurnstileWhenConfigured(),
  requireCriticalIdempotency({ scope: "shop_purchase" }),
  shopController.purchaseMiner,
);
