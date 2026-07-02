import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as ctrl from "./tournaments.controller.js";

export const tournamentsRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });

tournamentsRouter.get("/", limiter, ctrl.listTournaments);
tournamentsRouter.get("/my-history", requireAuth, limiter, ctrl.myHistory);
tournamentsRouter.get("/:id/my-score-breakdown", requireAuth, limiter, ctrl.myScoreBreakdown);
tournamentsRouter.get("/:id", limiter, ctrl.getTournament);
tournamentsRouter.get("/:id/my-rank", requireAuth, limiter, ctrl.myRank);
