import express from "express";
import { requireAuth } from "../middleware/auth.js";
import * as notificationController from "../controllers/notificationController.js";

export const notificationRouter = express.Router();

notificationRouter.get("/", requireAuth, notificationController.getNotifications);
notificationRouter.post("/read/:id", requireAuth, notificationController.markAsRead);
