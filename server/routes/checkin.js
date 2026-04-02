import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as checkinController from "../controllers/checkinController.js";

export const checkinRouter = express.Router();

const statusLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const confirmLimiter = createRateLimiter({ windowMs: 60_000, max: 25 });

checkinRouter.get("/status", requireAuth, statusLimiter, checkinController.getStatus);
checkinRouter.post("/confirm", requireAuth, confirmLimiter, checkinController.confirmCheckin);
