import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createDistributedRateLimiter } from "../middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../middleware/criticalIdempotency.js";
import * as machinesController from "../controllers/machinesController.js";

export const machinesRouter = express.Router();
const machinesLimiter = createDistributedRateLimiter({ windowMs: 60_000, max: 40, name: "machines_write" });

machinesRouter.get("/", requireAuth, machinesController.listMachines);
machinesRouter.post(
  "/toggle",
  requireAuth,
  machinesLimiter,
  requireCriticalIdempotency({ scope: "machine_toggle" }),
  machinesController.toggleMachine,
);
machinesRouter.post(
  "/remove",
  requireAuth,
  machinesLimiter,
  requireCriticalIdempotency({ scope: "machine_remove" }),
  machinesController.removeMachine,
);
machinesRouter.post(
  "/move",
  requireAuth,
  machinesLimiter,
  requireCriticalIdempotency({ scope: "machine_move" }),
  machinesController.moveMachine,
);
