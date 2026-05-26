import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import {
  offerwallMePostback,
  getOfferwallMeHistory,
  getOfferwallMeStats,
} from "./offerwallme.controller.js";

export const offerwallMeRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });

// offerwall.me sends GET or POST — support both
offerwallMeRouter.get("/postback", offerwallMePostback);
offerwallMeRouter.post("/postback", offerwallMePostback);

offerwallMeRouter.get("/history", requireAuth, limiter, getOfferwallMeHistory);
offerwallMeRouter.get("/stats", requireAuth, limiter, getOfferwallMeStats);
