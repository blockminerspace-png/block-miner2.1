import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as ctrl from "./burnEvents.controller.js";

export const burnEventsRouter = express.Router();

burnEventsRouter.get("/", ctrl.listActive);
burnEventsRouter.get("/my-machines", requireAuth, ctrl.myMachines);
burnEventsRouter.post("/:id/claim", requireAuth, ctrl.claim);
