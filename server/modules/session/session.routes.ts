import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { processHeartbeat } from "./session.controller.js";

export const sessionRouter = express.Router();

sessionRouter.post("/heartbeat", requireAuth, processHeartbeat);
