import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as ctrl from "./ptc.controller.js";

export const ptcRouter = express.Router();
export const ptcAdminRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const viewLimiter = createRateLimiter({ windowMs: 10_000, max: 5 });

// ── User routes ──────────────────────────────────────────────────────────────
ptcRouter.get("/settings", limiter, ctrl.getSettings);
ptcRouter.get("/next", requireAuth, limiter, ctrl.getNextAd);
ptcRouter.post("/view/:id", requireAuth, viewLimiter, ctrl.trackView);
ptcRouter.get("/earnings", requireAuth, limiter, ctrl.getEarningsHistory);

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
