import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import { getUserZeradsLink } from "./zerads.controller.js";

export const zeradsRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

zeradsRouter.get("/link", requireAuth, limiter, getUserZeradsLink);
