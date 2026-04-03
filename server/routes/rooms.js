import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  listRooms,
  buyRoom,
  installMiner,
  uninstallMiner,
  getSlotsSummary,
} from "../controllers/roomsController.js";

export const roomsRouter = express.Router();

roomsRouter.use(requireAuth);

roomsRouter.get("/", listRooms);
roomsRouter.post("/buy", buyRoom);
roomsRouter.post("/rack/install", installMiner);
roomsRouter.post("/rack/uninstall", uninstallMiner);
roomsRouter.get("/slots", getSlotsSummary);
