import express from "express";
import * as sidebarNavController from "../controllers/sidebarNavController.js";

export const sidebarNavRouter = express.Router();

sidebarNavRouter.get("/nav", sidebarNavController.getPublicNav);
