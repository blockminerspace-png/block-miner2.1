import express from "express";
import * as autoMiningGpuController from "../controllers/autoMiningGpuController.js";
import * as autoMiningV2Controller from "../controllers/autoMiningV2Controller.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

export const autoMiningGpuRouter = express.Router();

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

autoMiningGpuRouter.get("/available", requireAuth, autoMiningGpuController.getAvailableGPUsHandler);
autoMiningGpuRouter.post("/claim", requireAuth, autoMiningGpuController.claimGPUHandler);
autoMiningGpuRouter.get("/history", requireAuth, autoMiningGpuController.getGPUHistoryHandler);
autoMiningGpuRouter.get("/active-reward", requireAuth, autoMiningGpuController.getActiveRewardHandler);

/** Auto Mining GPU v2 — session-based cycles, daily UTC limit, turbo banners */
autoMiningGpuRouter.post(
  "/v2/session/start",
  requireAuth,
  v2SessionLimiter,
  autoMiningV2Controller.postStartSession
);
autoMiningGpuRouter.post(
  "/v2/session/stop",
  requireAuth,
  v2SessionLimiter,
  autoMiningV2Controller.postStopSession
);
autoMiningGpuRouter.get("/v2/status", requireAuth, autoMiningV2Controller.getV2Status);
autoMiningGpuRouter.post(
  "/v2/claim/normal",
  requireAuth,
  v2ClaimLimiter,
  autoMiningV2Controller.postClaimNormal
);
autoMiningGpuRouter.get(
  "/v2/banner",
  requireAuth,
  v2BannerLimiter,
  autoMiningV2Controller.getTurboBanner
);
autoMiningGpuRouter.post(
  "/v2/banner/click",
  requireAuth,
  v2BannerLimiter,
  autoMiningV2Controller.postBannerClick
);
autoMiningGpuRouter.post(
  "/v2/claim/turbo",
  requireAuth,
  v2ClaimLimiter,
  autoMiningV2Controller.postClaimTurbo
);
