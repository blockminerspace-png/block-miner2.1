import express from "express";
import * as healthController from "./health.controller.js";

export const healthRouter = express.Router();
healthRouter.get("/", healthController.health);
