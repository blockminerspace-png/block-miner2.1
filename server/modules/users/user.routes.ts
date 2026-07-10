import express from "express";
import * as userController from "./user.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";

const userRouter = express.Router();

const userLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100 // Increased from 20 to 100
});

userRouter.use(requireAuth, userLimiter);

userRouter.post("/change-username", userController.changeUsername);
userRouter.get("/2fa/status", userController.get2FAStatus);
userRouter.post("/2fa/generate", userController.generate2FA);
userRouter.post("/2fa/enable", userController.enable2FA);
userRouter.post("/2fa/disable", userController.disable2FA);
userRouter.get("/email-2fa/status", userController.getEmailTwoFactorStatus);
userRouter.post("/email-2fa/challenge", userController.requestEmailTwoFactorChallenge);
userRouter.post("/email-2fa/enable", userController.enableEmailTwoFactor);
userRouter.post("/email-2fa/disable", userController.disableEmailTwoFactor);
userRouter.post("/report-adblock", userController.reportAdblock);
userRouter.get("/referrals", userController.getReferrals);
userRouter.get("/referral-stats", userController.getReferralStats);
userRouter.post("/link-referral", userController.linkReferral);

export default userRouter;
