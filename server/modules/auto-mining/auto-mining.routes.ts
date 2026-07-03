import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath } from "../../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../../services/sidebarNavRegistry.js";
import * as v1 from "./auto-mining.controller.js";
import * as v2 from "./auto-mining.v2.controller.js";

export const autoMiningGpuRouter = express.Router();

const autoMiningPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.auto_mining.path, "auto_mining");

const v2SessionLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  keyGenerator: (req) => `autoMiningV2:session:${req.user?.id ?? "anon"}`,
});

const v2ClaimLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 12,
  keyGenerator: (req) => `autoMiningV2:claim:${req.user?.id ?? "anon"}`,
});

const v2BannerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 35,
  keyGenerator: (req) => `autoMiningV2:banner:${req.user?.id ?? "anon"}`,
});

// V1 endpoints
autoMiningGpuRouter.get("/available",     requireAuth, requireVisibleSidebarPath(autoMiningPath), v1.getAvailableGPUsHandler);
autoMiningGpuRouter.post("/claim",        requireAuth, requireVisibleSidebarPath(autoMiningPath), v1.claimGPUHandler);
autoMiningGpuRouter.get("/history",       requireAuth, requireVisibleSidebarPath(autoMiningPath), v1.getGPUHistoryHandler);
autoMiningGpuRouter.get("/active-reward", requireAuth, requireVisibleSidebarPath(autoMiningPath), v1.getActiveRewardHandler);

// V2 endpoints
autoMiningGpuRouter.post("/v2/session/start", requireAuth, requireVisibleSidebarPath(autoMiningPath), v2SessionLimiter, v2.postStartSession);
autoMiningGpuRouter.post("/v2/session/stop",  requireAuth, requireVisibleSidebarPath(autoMiningPath), v2SessionLimiter, v2.postStopSession);
autoMiningGpuRouter.get("/v2/status",         requireAuth, requireVisibleSidebarPath(autoMiningPath), v2.getV2Status);
autoMiningGpuRouter.post("/v2/claim/normal",  requireAuth, requireVisibleSidebarPath(autoMiningPath), v2ClaimLimiter, v2.postClaimNormal);
autoMiningGpuRouter.get("/v2/banner",         requireAuth, requireVisibleSidebarPath(autoMiningPath), v2BannerLimiter, v2.getTurboBanner);
autoMiningGpuRouter.post("/v2/banner/click",  requireAuth, requireVisibleSidebarPath(autoMiningPath), v2BannerLimiter, v2.postBannerClick);
autoMiningGpuRouter.post("/v2/claim/turbo",   requireAuth, requireVisibleSidebarPath(autoMiningPath), v2ClaimLimiter, v2.postClaimTurbo);
