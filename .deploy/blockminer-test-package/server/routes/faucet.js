import express from "express";
import * as faucetController from "../controllers/faucetController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { requireVisibleSidebarPath } from "../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../services/sidebarNavRegistry.js";

const faucetRouter = express.Router();
const faucetLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const faucetClaimLimiter = createRateLimiter({ windowMs: 60_000, max: 6 });
const faucetPath = SIDEBAR_ITEM_REGISTRY.faucet.path;

faucetRouter.get("/status", requireAuth, requireVisibleSidebarPath(faucetPath), faucetLimiter, faucetController.getStatus);
faucetRouter.post("/partner/start", requireAuth, requireVisibleSidebarPath(faucetPath), faucetLimiter, faucetController.startPartnerVisit);
faucetRouter.post("/claim", requireAuth, requireVisibleSidebarPath(faucetPath), faucetClaimLimiter, faucetController.claim);

export { faucetRouter };
