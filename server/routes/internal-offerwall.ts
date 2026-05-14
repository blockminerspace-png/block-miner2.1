import express from "express";
import { createDistributedRateLimiter } from "../middleware/distributedRateLimit.js";
import { getRequestIp } from "../utils/clientIp.js";
import { requireCriticalIdempotency } from "../middleware/criticalIdempotency.js";
import { requireAuth } from "../middleware/auth.js";
import * as internalOfferwallController from "../controllers/internalOfferwallController.js";
import { requireVisibleSidebarPath, sidebarRegistryPath } from "../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../services/sidebarNavRegistry.js";

export const internalOfferwallRouter = express.Router();
const internalOfferwallPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.internal_offerwall.path, "internal_offerwall");

const limiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 60,
  name: "internal_offerwall_read",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});
const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 30,
  name: "internal_offerwall_write",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

internalOfferwallRouter.get("/status", requireVisibleSidebarPath(internalOfferwallPath), limiter, internalOfferwallController.getFeatureStatus);
internalOfferwallRouter.get("/offers", requireAuth, requireVisibleSidebarPath(internalOfferwallPath), limiter, internalOfferwallController.getOffers);
internalOfferwallRouter.post(
  "/offers/:offerId/start",
  requireAuth,
  requireVisibleSidebarPath(internalOfferwallPath),
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_start" }),
  internalOfferwallController.postStart
);
internalOfferwallRouter.post(
  "/attempts/:attemptId/partner-opened",
  requireAuth,
  requireVisibleSidebarPath(internalOfferwallPath),
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_partner_opened" }),
  internalOfferwallController.postPartnerOpened
);
internalOfferwallRouter.post(
  "/attempts/:attemptId/submit",
  requireAuth,
  requireVisibleSidebarPath(internalOfferwallPath),
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_submit" }),
  internalOfferwallController.postSubmit
);
internalOfferwallRouter.post(
  "/attempts/:attemptId/abandon",
  requireAuth,
  requireVisibleSidebarPath(internalOfferwallPath),
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_abandon" }),
  internalOfferwallController.postAbandon
);
