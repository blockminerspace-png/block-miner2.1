import { Router } from "express";
import { requireAuth, authenticateTokenOptional } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as social from "./social.controller.js";
import { uploadChannelPhotoMiddleware, CHANNEL_PHOTO_FIELD } from "./social.upload.js";

export const socialRouter = Router();

// Vote endpoint: per-user/IP limit. Generous enough for legit toggling, blocks spam.
const voteRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Muitos votos em pouco tempo. Aguarde um instante.",
});

// Profile edit: light rate limit to discourage churn / abuse of the upload pipeline.
const profileUpdateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: "Muitas edições seguidas. Tente novamente em instantes.",
});

socialRouter.get("/feed", authenticateTokenOptional, social.getPublicFeed);
socialRouter.get("/my-profile", requireAuth, social.getMyProfile);
socialRouter.get("/my-submissions", requireAuth, social.getMySubmissions);
socialRouter.post("/submit", requireAuth, social.submitVideo);
socialRouter.post("/request-credential", requireAuth, social.requestCredential);
socialRouter.put("/my-profile", requireAuth, profileUpdateLimiter, social.updateMyProfile);
socialRouter.post("/videos/:id/vote", requireAuth, voteRateLimiter, social.voteVideo);
socialRouter.post(
  "/upload-photo",
  requireAuth,
  uploadChannelPhotoMiddleware.single(CHANNEL_PHOTO_FIELD),
  social.uploadChannelPhoto,
);
