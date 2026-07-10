import express from "express";
import { listLogsHandler, getLogDetailHandler } from "../controllers/adminAudit.controller.js";

export const adminLogsRouter = express.Router();

adminLogsRouter.get("/", listLogsHandler);
adminLogsRouter.get("/:id", getLogDetailHandler);
