import express from "express";
import * as shortlinkController from "../controllers/shortlinkController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath } from "../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../services/sidebarNavRegistry.js";

export const shortlinkRouter = express.Router();

const shortlinkLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60
});
const shortlinksPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.shortlinks.path, "shortlinks");

shortlinkRouter.get("/status", requireAuth, requireVisibleSidebarPath(shortlinksPath), shortlinkLimiter, shortlinkController.getShortlinkStatus);
shortlinkRouter.post("/start", requireAuth, requireVisibleSidebarPath(shortlinksPath), shortlinkLimiter, shortlinkController.startShortlink);
shortlinkRouter.post("/complete-step", requireAuth, requireVisibleSidebarPath(shortlinksPath), shortlinkLimiter, shortlinkController.completeShortlinkStep);
