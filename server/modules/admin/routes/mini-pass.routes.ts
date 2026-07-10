import express from "express";
import * as ctrl from "../controllers/adminMiniPass.controller.js";

export const adminMiniPassRouter = express.Router();

adminMiniPassRouter.get("/mini-pass/seasons", ctrl.adminListMiniPassSeasons);
adminMiniPassRouter.post("/mini-pass/seasons", ctrl.adminCreateMiniPassSeason);
adminMiniPassRouter.get("/mini-pass/seasons/:id", ctrl.adminGetMiniPassSeason);
adminMiniPassRouter.put("/mini-pass/seasons/:id", ctrl.adminUpdateMiniPassSeason);
adminMiniPassRouter.delete("/mini-pass/seasons/:id", ctrl.adminSoftDeleteMiniPassSeason);

adminMiniPassRouter.post("/mini-pass/seasons/:seasonId/level-rewards", ctrl.adminUpsertLevelReward);
adminMiniPassRouter.put(
  "/mini-pass/seasons/:seasonId/level-rewards/:rewardId",
  ctrl.adminUpsertLevelReward
);
adminMiniPassRouter.delete(
  "/mini-pass/seasons/:seasonId/level-rewards/:rewardId",
  ctrl.adminDeleteLevelReward
);

adminMiniPassRouter.post("/mini-pass/seasons/:seasonId/missions", ctrl.adminUpsertMission);
adminMiniPassRouter.put(
  "/mini-pass/seasons/:seasonId/missions/:missionId",
  ctrl.adminUpsertMission
);
adminMiniPassRouter.delete(
  "/mini-pass/seasons/:seasonId/missions/:missionId",
  ctrl.adminDeleteMission
);
