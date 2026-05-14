import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as readEarnController from "../controllers/readEarnController.js";
import { requireVisibleSidebarPath, sidebarRegistryPath } from "../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../services/sidebarNavRegistry.js";

export const readEarnRouter = express.Router();
const readEarnPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.read_earn.path, "read_earn");

const redeemLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many redeem attempts. Try again later."
});

readEarnRouter.get("/campaigns", requireVisibleSidebarPath(readEarnPath), readEarnController.getPublicReadEarnCampaigns);
readEarnRouter.post(
  "/redeem",
  requireAuth,
  requireVisibleSidebarPath(readEarnPath),
  redeemLimiter,
  readEarnController.postReadEarnRedeem
);
