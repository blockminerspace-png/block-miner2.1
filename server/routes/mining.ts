import express from "express";
import * as miningController from "../controllers/miningController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const miningRouter = express.Router();
const readLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

miningRouter.get("/cycle", readLimiter, miningController.getCycle);
miningRouter.get("/reward-rate", requireAuth, readLimiter, miningController.getRewardRate);
miningRouter.patch("/allocation", requireAuth, writeLimiter, miningController.updateAllocation);

export { miningRouter };
