import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import { z } from "zod";
import * as offerEventController from "../controllers/offerEventController.js";

export const offerEventsRouter = express.Router();

const listLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const purchaseLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

const purchaseSchema = z.object({
  eventMinerId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(25).optional().default(1)
}).strict();

offerEventsRouter.get("/active", requireAuth, listLimiter, offerEventController.listActiveOfferEvents);
offerEventsRouter.post(
  "/purchase",
  requireAuth,
  purchaseLimiter,
  validateBody(purchaseSchema),
  offerEventController.purchaseOfferMiner
);
offerEventsRouter.get("/:id", requireAuth, listLimiter, offerEventController.getOfferEventDetail);
