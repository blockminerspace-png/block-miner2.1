import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createDistributedRateLimiter } from "../middleware/distributedRateLimit.js";
import { requireTurnstileWhenConfigured } from "../middleware/turnstile.js";
import { getRequestIp } from "../utils/clientIp.js";
import { requireCriticalIdempotency } from "../middleware/criticalIdempotency.js";
import { validateBody } from "../middleware/validate.js";
import { z } from "zod";
import * as offerEventController from "../controllers/offerEventController.js";

export const offerEventsRouter = express.Router();

const listLimiter = createDistributedRateLimiter({ windowMs: 60_000, max: 120, name: "offer_events_list" });
const purchaseLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 20,
  name: "offer_events_purchase",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

const purchaseSchema = z.object({
  eventMinerId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(25).optional().default(1),
  cfTurnstileToken: z.string().trim().optional(),
}).strict();

offerEventsRouter.get("/active", requireAuth, listLimiter, offerEventController.listActiveOfferEvents);
offerEventsRouter.post(
  "/purchase",
  requireAuth,
  purchaseLimiter,
  requireTurnstileWhenConfigured(),
  validateBody(purchaseSchema),
  requireCriticalIdempotency({ scope: "offer_event_purchase" }),
  offerEventController.purchaseOfferMiner
);
offerEventsRouter.get("/:id", requireAuth, listLimiter, offerEventController.getOfferEventDetail);
