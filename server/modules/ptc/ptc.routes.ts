import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as ctrl from "./ptc.controller.js";

export const ptcRouter = express.Router();
export const ptcAdminRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const viewLimiter = createRateLimiter({ windowMs: 10_000, max: 5 });

const heartbeatLimiter = createRateLimiter({ windowMs: 30_000, max: 10 });

// ── User routes ──────────────────────────────────────────────────────────────
ptcRouter.get("/settings", limiter, ctrl.getSettings);
ptcRouter.get("/tiers", limiter, ctrl.getActiveTiers);
ptcRouter.get("/ads", requireAuth, limiter, ctrl.getAvailableAds);
ptcRouter.get("/earnings", requireAuth, limiter, ctrl.getEarningsHistory);

// ── Session routes ───────────────────────────────────────────────────────────
ptcRouter.get("/session/active", requireAuth, limiter, ctrl.getActiveSession);
ptcRouter.post("/session/start", requireAuth, viewLimiter, ctrl.startSession);
ptcRouter.post("/session/:sessionId/heartbeat", requireAuth, heartbeatLimiter, ctrl.heartbeat);
ptcRouter.post("/session/:sessionId/pause", requireAuth, limiter, ctrl.pauseSession);
ptcRouter.post("/session/:sessionId/cancel", requireAuth, limiter, ctrl.cancelSession);
ptcRouter.post("/session/:sessionId/claim", requireAuth, viewLimiter, ctrl.claimSession);

ptcRouter.get("/my-campaigns", requireAuth, limiter, ctrl.getMyCampaigns);
ptcRouter.post("/campaigns", requireAuth, limiter, ctrl.createCampaign);
ptcRouter.patch("/campaigns/:id", requireAuth, limiter, ctrl.editCampaign);
ptcRouter.post("/campaigns/:id/add-views", requireAuth, limiter, ctrl.addViews);
ptcRouter.post("/campaigns/:id/remove-views", requireAuth, limiter, ctrl.removeViews);

// ── Admin routes ─────────────────────────────────────────────────────────────
ptcAdminRouter.get("/settings", ctrl.getSettings);
ptcAdminRouter.put("/settings", ctrl.updateSettings);
ptcAdminRouter.get("/campaigns/pending", ctrl.adminListPending);
ptcAdminRouter.get("/campaigns", ctrl.adminListAll);
ptcAdminRouter.post("/campaigns/:id/approve", ctrl.adminApprove);
ptcAdminRouter.post("/campaigns/:id/reject", ctrl.adminReject);
ptcAdminRouter.get("/tiers", ctrl.adminGetTiers);
ptcAdminRouter.post("/tiers", ctrl.adminCreateTier);
ptcAdminRouter.put("/tiers/:id", ctrl.adminUpdateTier);
ptcAdminRouter.delete("/tiers/:id", ctrl.adminDeleteTier);
