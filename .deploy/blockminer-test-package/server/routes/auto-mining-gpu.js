import express from "express";
import * as autoMiningGpuController from "../controllers/autoMiningGpuController.js";
import * as autoMiningV2Controller from "../controllers/autoMiningV2Controller.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { requireVisibleSidebarPath } from "../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../services/sidebarNavRegistry.js";

export const autoMiningGpuRouter = express.Router();
const autoMiningPath = SIDEBAR_ITEM_REGISTRY.auto_mining.path;

const v2SessionLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  keyGenerator: (req) => `autoMiningV2:session:${req.user?.id ?? "anon"}`
});

const v2ClaimLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 12,
  keyGenerator: (req) => `autoMiningV2:claim:${req.user?.id ?? "anon"}`
});

const v2BannerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 35,
  keyGenerator: (req) => `autoMiningV2:banner:${req.user?.id ?? "anon"}`
});

autoMiningGpuRouter.get("/available", requireAuth, requireVisibleSidebarPath(autoMiningPath), autoMiningGpuController.getAvailableGPUsHandler);
autoMiningGpuRouter.post("/claim", requireAuth, requireVisibleSidebarPath(autoMiningPath), autoMiningGpuController.claimGPUHandler);
autoMiningGpuRouter.get("/history", requireAuth, requireVisibleSidebarPath(autoMiningPath), autoMiningGpuController.getGPUHistoryHandler);
autoMiningGpuRouter.get("/active-reward", requireAuth, requireVisibleSidebarPath(autoMiningPath), autoMiningGpuController.getActiveRewardHandler);

/** Auto Mining GPU v2 — session-based cycles, daily UTC limit, turbo banners */
autoMiningGpuRouter.post(
  "/v2/session/start",
  requireAuth,
  requireVisibleSidebarPath(autoMiningPath),
  v2SessionLimiter,
  autoMiningV2Controller.postStartSession
);
autoMiningGpuRouter.post(
  "/v2/session/stop",
  requireAuth,
  requireVisibleSidebarPath(autoMiningPath),
  v2SessionLimiter,
  autoMiningV2Controller.postStopSession
);
autoMiningGpuRouter.get("/v2/status", requireAuth, requireVisibleSidebarPath(autoMiningPath), autoMiningV2Controller.getV2Status);
autoMiningGpuRouter.post(
  "/v2/claim/normal",
  requireAuth,
  requireVisibleSidebarPath(autoMiningPath),
  v2ClaimLimiter,
  autoMiningV2Controller.postClaimNormal
);
autoMiningGpuRouter.get(
  "/v2/banner",
  requireAuth,
  requireVisibleSidebarPath(autoMiningPath),
  v2BannerLimiter,
  autoMiningV2Controller.getTurboBanner
);
autoMiningGpuRouter.post(
  "/v2/banner/click",
  requireAuth,
  requireVisibleSidebarPath(autoMiningPath),
  v2BannerLimiter,
  autoMiningV2Controller.postBannerClick
);
autoMiningGpuRouter.post(
  "/v2/claim/turbo",
  requireAuth,
  requireVisibleSidebarPath(autoMiningPath),
  v2ClaimLimiter,
  autoMiningV2Controller.postClaimTurbo
);
