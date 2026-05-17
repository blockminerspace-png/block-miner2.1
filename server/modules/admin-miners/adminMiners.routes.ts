import express from "express";
import {
  archiveAdminMinerController,
  createAdminMinerController,
  duplicateAdminMinerController,
  getAdminMinerController,
  listAdminMinersController,
  toggleAdminMinerActiveController,
  toggleAdminMinerStoreController,
  updateAdminMinerController,
  uploadAdminMinerImageController,
} from "./adminMiners.controller.js";

export const adminMinersRouter = express.Router();

adminMinersRouter.get("/miners", listAdminMinersController);
adminMinersRouter.post("/miners", createAdminMinerController);
adminMinersRouter.post("/miners/upload-image", uploadAdminMinerImageController);
adminMinersRouter.get("/miners/:id", getAdminMinerController);
adminMinersRouter.patch("/miners/:id", updateAdminMinerController);
adminMinersRouter.put("/miners/:id", updateAdminMinerController);
adminMinersRouter.post("/miners/:id/duplicate", duplicateAdminMinerController);
adminMinersRouter.post("/miners/:id/archive", archiveAdminMinerController);
adminMinersRouter.post("/miners/:id/toggle-store", toggleAdminMinerStoreController);
adminMinersRouter.post("/miners/:id/toggle-active", toggleAdminMinerActiveController);
