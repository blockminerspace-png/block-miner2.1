import express from "express";
import * as sidebarNavController from "./sidebarNav.controller.js";

export const sidebarNavRouter = express.Router();

sidebarNavRouter.get("/nav", sidebarNavController.getPublicNav);
