import express from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import * as ctrl from "./tournaments.admin.controller.js";

export const adminTournamentsRouter = express.Router();

adminTournamentsRouter.use(requireAdminAuth);

adminTournamentsRouter.get("/", ctrl.listAll);
adminTournamentsRouter.get("/display-order", ctrl.getDisplayOrder);
adminTournamentsRouter.patch("/display-order", ctrl.updateDisplayOrder);
adminTournamentsRouter.post("/", ctrl.create);
adminTournamentsRouter.patch("/:id", ctrl.update);
adminTournamentsRouter.post("/:id/cancel", ctrl.cancel);
adminTournamentsRouter.post("/:id/finalize", ctrl.finalize);
adminTournamentsRouter.get("/:id/entries", ctrl.entries);
adminTournamentsRouter.get("/:id/score-audit", ctrl.scoreAudit);
adminTournamentsRouter.get("/:id/score-audit/:userId", ctrl.scoreAuditUser);
adminTournamentsRouter.get("/:id/engine-stats", ctrl.engineStats);
adminTournamentsRouter.get("/:id/drift-alerts", ctrl.driftAlerts);
