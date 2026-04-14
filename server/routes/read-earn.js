import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as readEarnController from "../controllers/readEarnController.js";

export const readEarnRouter = express.Router();

const redeemLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many redeem attempts. Try again later."
});

readEarnRouter.get("/campaigns", readEarnController.getPublicReadEarnCampaigns);
readEarnRouter.post(
  "/redeem",
  requireAuth,
  redeemLimiter,
  readEarnController.postReadEarnRedeem
);
