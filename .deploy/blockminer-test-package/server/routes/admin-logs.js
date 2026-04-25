import express from "express";
import { listLogsHandler, getLogDetailHandler } from "../controllers/adminAuditController.js";

export const adminLogsRouter = express.Router();

adminLogsRouter.get("/", listLogsHandler);
adminLogsRouter.get("/:id", getLogDetailHandler);
