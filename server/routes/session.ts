import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { processHeartbeat } from "../controllers/sessionController.js";

export const sessionRouter = express.Router();

sessionRouter.post("/heartbeat", requireAuth, processHeartbeat);
