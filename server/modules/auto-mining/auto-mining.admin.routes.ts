import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/admin.js";
import * as adminController from "./auto-mining.admin.controller.js";

export const adminAutoMiningRewardsRouter = express.Router();

const adminAuth = [requireAuth, requireAdmin];

adminAutoMiningRewardsRouter.post("/",                        adminAuth, adminController.createRewardHandler);
adminAutoMiningRewardsRouter.get("/",                         adminAuth, adminController.getAllRewardsHandler);
adminAutoMiningRewardsRouter.get("/active",                   adminAuth, adminController.getActiveRewardsHandler);
adminAutoMiningRewardsRouter.get("/stats",                    adminAuth, adminController.getRewardsStatsHandler);
adminAutoMiningRewardsRouter.get("/:reward_id",               adminAuth, adminController.getRewardHandler);
adminAutoMiningRewardsRouter.patch("/:reward_id",             adminAuth, adminController.updateRewardHandler);
adminAutoMiningRewardsRouter.post("/:reward_id/activate",     adminAuth, adminController.activateRewardHandler);
adminAutoMiningRewardsRouter.post("/:reward_id/deactivate",   adminAuth, adminController.deactivateRewardHandler);
adminAutoMiningRewardsRouter.delete("/:reward_id",            adminAuth, adminController.deleteRewardHandler);
