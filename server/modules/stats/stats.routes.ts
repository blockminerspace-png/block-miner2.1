import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as statsController from "./stats.controller.js";

export const statsRouter = express.Router();

const statsLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 45,
});

statsRouter.get("/power", requireAuth, statsLimiter, statsController.getPowerStats);
