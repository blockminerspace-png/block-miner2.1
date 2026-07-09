import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as ctrl from "./energyTax.controller.js";

export const energyTaxRouter = Router();

const summaryLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const payLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

energyTaxRouter.get("/summary", requireAuth, summaryLimiter, ctrl.getSummary);
energyTaxRouter.post("/pay-daily", requireAuth, payLimiter, ctrl.postPayDaily);
