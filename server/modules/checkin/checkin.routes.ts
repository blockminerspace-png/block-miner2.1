import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath } from "../../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../../services/sidebarNavRegistry.js";
import * as checkinController from "./checkin.controller.js";
import * as streakRecoveryController from "./streakRecovery.controller.js";

export const checkinRouter = express.Router();

const statusLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const confirmLimiter = createRateLimiter({ windowMs: 60_000, max: 25 });

const checkinPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.checkin.path, "checkin");

checkinRouter.get("/status", requireAuth, requireVisibleSidebarPath(checkinPath), statusLimiter, checkinController.getStatus);
checkinRouter.get("/rewards", requireAuth, requireVisibleSidebarPath(checkinPath), statusLimiter, checkinController.getCheckinRewards);
checkinRouter.get("/history", requireAuth, requireVisibleSidebarPath(checkinPath), statusLimiter, checkinController.getCheckinHistory);
checkinRouter.post("/claim", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.claimCheckin);
checkinRouter.post("/claim/onchain", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.claimCheckinOnchain);
checkinRouter.post("/confirm", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.confirmCheckin);
checkinRouter.post("/wallet", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.checkinWallet);
checkinRouter.post("/balance", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.checkinBalance);

const recoveryLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
checkinRouter.get("/streak-recovery/status", requireAuth, recoveryLimiter, streakRecoveryController.getStreakRecoveryStatus);
checkinRouter.post("/streak-recovery/pay", requireAuth, recoveryLimiter, streakRecoveryController.payStreakRecovery);
