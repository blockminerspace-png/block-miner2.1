import express from "express";
import {
  archiveAdminMinerController,
  assignBrokenMachinesController,
  createAdminMinerController,
  duplicateAdminMinerController,
  getAdminMinerController,
  listAdminMinersController,
  listBrokenMachineGroupsController,
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
adminMinersRouter.get("/miners/broken-machines", listBrokenMachineGroupsController);
adminMinersRouter.post("/miners/broken-machines/assign", assignBrokenMachinesController);
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
