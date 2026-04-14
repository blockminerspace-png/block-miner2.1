import express from "express";
import * as adminYoutubeStreamController from "../controllers/adminYoutubeStreamController.js";

export const adminYoutubeStreamRouter = express.Router();

adminYoutubeStreamRouter.get("/streaming/destinations", adminYoutubeStreamController.listDestinations);
adminYoutubeStreamRouter.get("/streaming/destinations/:id", adminYoutubeStreamController.getDestination);
adminYoutubeStreamRouter.post("/streaming/destinations", adminYoutubeStreamController.createDestination);
adminYoutubeStreamRouter.patch("/streaming/destinations/:id", adminYoutubeStreamController.patchDestination);
adminYoutubeStreamRouter.delete("/streaming/destinations/:id", adminYoutubeStreamController.deleteDestination);
adminYoutubeStreamRouter.post("/streaming/destinations/:id/start", adminYoutubeStreamController.postStart);
adminYoutubeStreamRouter.post("/streaming/destinations/:id/stop", adminYoutubeStreamController.postStop);
