import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath } from "../../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../../services/sidebarNavRegistry.js";
import * as youtubeController from "./youtube.controller.js";

export const youtubeRouter = express.Router();

const youtubePath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.youtube.path, "youtube");
const claimLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 60 });

youtubeRouter.get("/status", requireAuth, requireVisibleSidebarPath(youtubePath), youtubeController.getStatus);
youtubeRouter.get("/stats", requireAuth, requireVisibleSidebarPath(youtubePath), youtubeController.getStats);
youtubeRouter.post(
  "/claim",
  requireAuth,
  requireVisibleSidebarPath(youtubePath),
  claimLimiter,
  youtubeController.claimReward,
);
