import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as dailyTasks from "../controllers/dailyTasksController.js";

export const dailyTasksRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 40 });

dailyTasksRouter.get("/", requireAuth, limiter, dailyTasks.getDailyTasks);
dailyTasksRouter.post("/:taskId/claim", requireAuth, writeLimiter, dailyTasks.postClaimDailyTask);
