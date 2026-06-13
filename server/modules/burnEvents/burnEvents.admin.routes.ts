import express from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import * as ctrl from "./burnEvents.admin.controller.js";

export const adminBurnEventsRouter = express.Router();

adminBurnEventsRouter.use(requireAdminAuth);

adminBurnEventsRouter.get("/", ctrl.listAll);
adminBurnEventsRouter.post("/", ctrl.create);
adminBurnEventsRouter.put("/:id", ctrl.update);
adminBurnEventsRouter.delete("/:id", ctrl.remove);
adminBurnEventsRouter.get("/:id/claims", ctrl.claims);
