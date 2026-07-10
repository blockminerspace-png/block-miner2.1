import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as gamesPowerController from "./gamesPower.controller.js";
import { game2048Router } from "./game2048.routes.js";

export const gamesRouter = express.Router();

gamesRouter.get("/active-powers", requireAuth, gamesPowerController.getActiveGamePowers);
gamesRouter.use("/2048", game2048Router);
