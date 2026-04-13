import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as game2048Controller from "../controllers/game2048Controller.js";

export const game2048Router = express.Router();

const readLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 90 });

game2048Router.get("/status", requireAuth, readLimiter, game2048Controller.getStatus);
game2048Router.post("/start", requireAuth, writeLimiter, game2048Controller.postStart);
game2048Router.post("/move", requireAuth, writeLimiter, game2048Controller.postMove);
game2048Router.post("/claim", requireAuth, writeLimiter, game2048Controller.postClaim);
