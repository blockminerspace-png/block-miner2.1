import express from "express";
import {
  archiveAdminMinerController,
  createAdminMinerController,
  duplicateAdminMinerController,
  getAdminMinerController,
  listAdminMinersController,
  listOrphanMachineTypesController,
  relinkOrphanMachineTypesController,
  toggleAdminMinerActiveController,
  toggleAdminMinerStoreController,
  updateAdminMinerController,
  optionalAdminMinerImageUpload,
  uploadAdminMinerImageController,
} from "./adminMiners.controller.js";

export const adminMinersRouter = express.Router();

adminMinersRouter.get("/miners", listAdminMinersController);
adminMinersRouter.get("/miners/orphan-types", listOrphanMachineTypesController);
adminMinersRouter.post("/miners/orphan-types/relink", relinkOrphanMachineTypesController);
adminMinersRouter.post("/miners", optionalAdminMinerImageUpload, createAdminMinerController);
adminMinersRouter.post("/miners/upload-image", uploadAdminMinerImageController);
adminMinersRouter.get("/miners/:id", getAdminMinerController);
adminMinersRouter.patch("/miners/:id", optionalAdminMinerImageUpload, updateAdminMinerController);
adminMinersRouter.put("/miners/:id", optionalAdminMinerImageUpload, updateAdminMinerController);
adminMinersRouter.post("/miners/:id/duplicate", duplicateAdminMinerController);
adminMinersRouter.post("/miners/:id/archive", archiveAdminMinerController);
adminMinersRouter.post("/miners/:id/toggle-store", toggleAdminMinerStoreController);
adminMinersRouter.post("/miners/:id/toggle-active", toggleAdminMinerActiveController);
