import express from "express";
import * as ctrl from "./tournaments.admin.controller.js";

export const adminTournamentsRouter = express.Router();

adminTournamentsRouter.get("/", ctrl.listAll);
adminTournamentsRouter.post("/", ctrl.create);
adminTournamentsRouter.post("/:id/cancel", ctrl.cancel);
adminTournamentsRouter.post("/:id/finalize", ctrl.finalize);
adminTournamentsRouter.get("/:id/entries", ctrl.entries);
