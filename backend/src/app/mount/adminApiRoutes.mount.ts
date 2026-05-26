import type { Express } from "express";
import { adminAuthRouter } from "#server/routes/admin-auth.js";
import { adminRouter } from "#server/routes/admin.js";
import { adminAutoMiningRewardsRouter } from "#server/routes/admin-auto-mining-rewards.js";
import { adminTournamentsRouter } from "#server/modules/tournaments/index.js";
import { adminTrafficRouter } from "#server/modules/traffic/index.js";
import { ptcAdminRouter } from "#server/modules/ptc/ptc.routes.js";

export function mountAdminApiRoutes(app: Express): void {
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin/auto-mining-rewards", adminAutoMiningRewardsRouter);
  app.use("/api/admin/tournaments", adminTournamentsRouter);
  app.use("/api/admin/traffic", adminTrafficRouter);
  app.use("/api/admin/ptc", ptcAdminRouter);
}
