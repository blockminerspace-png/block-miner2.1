import type { Express } from "express";
import { adminAuthRouter } from "#server/routes/admin-auth.js";
import { adminRouter } from "#server/routes/admin.js";
import { adminAutoMiningRewardsRouter } from "#server/modules/auto-mining/index.js";
import { adminTournamentsRouter } from "#server/modules/tournaments/index.js";
import { adminOfferwallRouter } from "#server/modules/offerwall/offerwall.admin.routes.js";
import { adminTrafficRouter } from "#server/modules/traffic/index.js";
import { ptcAdminRouter } from "#server/modules/ptc/ptc.routes.js";
import { adminPartnerGamesRouter } from "#server/modules/partnerGames/partnerGames.routes.js";
import { adminBurnEventsRouter } from "#server/modules/burnEvents/index.js";

export function mountAdminApiRoutes(app: Express): void {
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin/auto-mining-rewards", adminAutoMiningRewardsRouter);
  app.use("/api/admin/tournaments", adminTournamentsRouter);
  app.use("/api/admin/offerwall", adminOfferwallRouter);
  app.use("/api/admin/traffic", adminTrafficRouter);
  app.use("/api/admin/ptc", ptcAdminRouter);
  // Admin routes for partner-games go under /api/admin/partner-games.
  // Auth gating: the existing adminRouter (/api/admin/...) wires requireAdmin
  // upstream; our router below sits inside the same admin tree.
  app.use("/api/admin/partner-games", adminPartnerGamesRouter);
  app.use("/api/admin/burn-events", adminBurnEventsRouter);
}
