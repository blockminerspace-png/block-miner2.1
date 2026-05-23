import type { Express } from "express";
import * as publicLiveStatsController from "#server/controllers/publicLiveStatsController.js";
import * as publicStatsController from "#server/controllers/publicStatsController.js";
import * as bannerController from "#server/controllers/bannerController.js";
import * as transparencyController from "#server/controllers/transparencyController.js";
import { createRateLimiter } from "#server/middleware/rateLimit.js";
import { healthRouter } from "../../modules/health/health.routes.js";
import { zeradsCallbackHandler } from "#server/modules/zerads/zerads.controller.js";

export function mountPublicSurfaceRoutes(app: Express): void {
  const publicLiveStatsLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
  });
  app.get("/api/live-server-stats", publicLiveStatsLimiter, publicLiveStatsController.getLiveStats);

  app.get("/api/public-stats", publicStatsController.getPublicStats);

  app.use("/health", healthRouter);

  app.get("/api/banners", bannerController.getActiveBanners);

  app.get("/api/transparency", transparencyController.getPublicEntries);
  app.get("/api/transparency/wallet-stats", transparencyController.getPublicWalletStats);
  app.get("/api/transparency/withdrawal-stats", transparencyController.getPublicWithdrawalStats);

  // Zerads PTC offerwall callback — called by Zerads server every ~5 min.
  // Security is handled inside the handler (IP + password guard).
  app.get("/zeradsptc.php", zeradsCallbackHandler);
}
