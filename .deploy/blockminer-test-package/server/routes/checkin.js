import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { requireVisibleSidebarPath } from "../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../services/sidebarNavRegistry.js";
import * as checkinController from "../controllers/checkinController.js";

export const checkinRouter = express.Router();

const statusLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const confirmLimiter = createRateLimiter({ windowMs: 60_000, max: 25 });

const checkinPath = SIDEBAR_ITEM_REGISTRY.checkin.path;

checkinRouter.get("/status", requireAuth, requireVisibleSidebarPath(checkinPath), statusLimiter, checkinController.getStatus);
checkinRouter.post("/claim", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.claimCheckin);
checkinRouter.post("/confirm", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.confirmCheckin);
checkinRouter.post("/wallet", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.checkinWallet);
checkinRouter.post("/balance", requireAuth, requireVisibleSidebarPath(checkinPath), confirmLimiter, checkinController.checkinBalance);
