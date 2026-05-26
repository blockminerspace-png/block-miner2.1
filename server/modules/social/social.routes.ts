import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as social from "./social.controller.js";
import { uploadChannelPhotoMiddleware, CHANNEL_PHOTO_FIELD } from "./social.upload.js";

export const socialRouter = Router();

socialRouter.get("/feed", social.getPublicFeed);
socialRouter.get("/my-profile", requireAuth, social.getMyProfile);
socialRouter.get("/my-submissions", requireAuth, social.getMySubmissions);
socialRouter.post("/submit", requireAuth, social.submitVideo);
socialRouter.post("/request-credential", requireAuth, social.requestCredential);
socialRouter.post(
  "/upload-photo",
  requireAuth,
  uploadChannelPhotoMiddleware.single(CHANNEL_PHOTO_FIELD),
  social.uploadChannelPhoto,
);
