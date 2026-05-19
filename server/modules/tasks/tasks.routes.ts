import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as tasksController from "./tasks.controller.js";

export const tasksRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 40 });

tasksRouter.get("/", requireAuth, limiter, tasksController.getDailyTasks);
tasksRouter.post("/:taskId/claim", requireAuth, writeLimiter, tasksController.postClaimDailyTask);
