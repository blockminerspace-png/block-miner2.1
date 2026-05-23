import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as ctrl from "./powerBoost.controller.js";

export const powerBoostRouter = express.Router();

powerBoostRouter.get("/status", requireAuth, ctrl.getStatus);
powerBoostRouter.post("/activate", requireAuth, ctrl.activate);
