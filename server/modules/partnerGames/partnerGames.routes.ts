import { Router } from "express";
import { requireAuth, authenticateTokenOptional } from "../../middleware/auth.js";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import * as ctrl from "./partnerGames.controller.js";

export const partnerGamesRouter = Router();

// Vote: per-user / IP limit, mirrors the YouTube video vote limit.
const voteRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Muitos votos em pouco tempo. Aguarde um instante.",
});

// Public: list visible partner games (vote totals + viewer's own vote when logged in).
partnerGamesRouter.get("/", authenticateTokenOptional, ctrl.listPartnerGamesPublic);

// Public (authenticated): vote on a partner game.
partnerGamesRouter.post("/:id/vote", requireAuth, voteRateLimiter, ctrl.votePartnerGame);

// Admin endpoints (mounted under /api/admin/partner-games). Apply admin auth
// at the router level — every sibling admin router in the codebase guards
// its own routes (there is no upstream chain auto-applied to /api/admin/*).
export const adminPartnerGamesRouter = Router();
adminPartnerGamesRouter.use(requireAdminAuth);
adminPartnerGamesRouter.get("/", ctrl.adminListPartnerGames);
adminPartnerGamesRouter.post("/upload-cover", ctrl.uploadPartnerGameCover);
adminPartnerGamesRouter.post("/", ctrl.adminCreatePartnerGame);
adminPartnerGamesRouter.put("/:id", ctrl.adminUpdatePartnerGame);
adminPartnerGamesRouter.delete("/:id", ctrl.adminDeletePartnerGame);
