import { Router } from "express";
import { getRewardInbox, collectReward, collectAllRewards } from "./rewardInbox.controller.js";

export const rewardInboxRouter = Router();

rewardInboxRouter.get("/", getRewardInbox);
rewardInboxRouter.post("/collect-all", collectAllRewards);
rewardInboxRouter.post("/:id/collect", collectReward);
