import express from "express";
import * as miningController from "../controllers/miningController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const miningRouter = express.Router();
const readLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

miningRouter.get("/cycle", readLimiter, miningController.getCycle);
miningRouter.get("/reward-rate", requireAuth, readLimiter, miningController.getRewardRate);

export { miningRouter };
