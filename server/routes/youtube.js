import express from "express";
import * as youtubeController from "../controllers/youtubeController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

export const youtubeRouter = express.Router();

const claimLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }); // 5 claims per hour

youtubeRouter.get("/status", requireAuth, youtubeController.getStatus);
youtubeRouter.get("/stats", requireAuth, youtubeController.getStats);
youtubeRouter.post("/claim", requireAuth, claimLimiter, youtubeController.claimReward);
