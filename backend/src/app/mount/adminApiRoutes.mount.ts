import type { Express } from "express";
import { adminAuthRouter } from "#server/routes/admin-auth.js";
import { adminRouter } from "#server/routes/admin.js";
import { adminAutoMiningRewardsRouter } from "#server/routes/admin-auto-mining-rewards.js";

export function mountAdminApiRoutes(app: Express): void {
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin/auto-mining-rewards", adminAutoMiningRewardsRouter);
}
