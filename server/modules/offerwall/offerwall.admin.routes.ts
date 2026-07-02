import express from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import * as ctrl from "./offerwall.admin.controller.js";

export const adminOfferwallRouter = express.Router();

adminOfferwallRouter.use(requireAdminAuth);
adminOfferwallRouter.get("/analytics", ctrl.getOfferwallAnalytics);
