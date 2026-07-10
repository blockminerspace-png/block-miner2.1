import express from "express";
import * as healthController from "./health.controller.js";

export const healthRouter = express.Router();

/** Backward-compatible basic health (unchanged contract). */
healthRouter.get("/", healthController.health);
healthRouter.get("/live", healthController.live);
healthRouter.get("/ready", healthController.ready);
healthRouter.get("/alerts", healthController.alerts);

/** Prometheus text exposition at /health/metrics (also mounted at /metrics). */
healthRouter.get("/metrics", healthController.metrics);
