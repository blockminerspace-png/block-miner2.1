import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createDistributedRateLimiter } from "../../middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../middleware/criticalIdempotency.js";
import * as inventoryController from "./inventory.controller.js";

export const inventoryRouter = express.Router();
const inventoryLimiter = createDistributedRateLimiter({ windowMs: 60_000, max: 20, name: "inventory_write" });

inventoryRouter.get("/", requireAuth, inventoryController.getInventory);
inventoryRouter.post(
  "/install",
  requireAuth,
  inventoryLimiter,
  requireCriticalIdempotency({ scope: "inventory_install" }),
  inventoryController.installInventoryItem,
);
inventoryRouter.post(
  "/remove",
  requireAuth,
  inventoryLimiter,
  requireCriticalIdempotency({ scope: "inventory_remove" }),
  inventoryController.removeInventoryItem,
);
inventoryRouter.post("/update", requireAuth, inventoryLimiter, inventoryController.updateInventory);
