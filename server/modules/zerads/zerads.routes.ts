import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import {
  getUserZeradsLink,
  getZeradsHistory,
  getZeradsStats,
} from "./zerads.controller.js";

export const zeradsRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });

zeradsRouter.get("/link", requireAuth, limiter, getUserZeradsLink);
zeradsRouter.get("/history", requireAuth, limiter, getZeradsHistory);
zeradsRouter.get("/stats", requireAuth, limiter, getZeradsStats);
