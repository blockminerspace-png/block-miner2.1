import type { Express } from "express";
import { trafficRouter } from "#server/modules/traffic/index.js";
import * as publicLiveStatsController from "#server/modules/public-stats/public-live-stats.controller.js";
import * as publicStatsController from "#server/modules/public-stats/public-stats.controller.js";
import * as bannerController from "#server/modules/banners/banner.controller.js";
import * as transparencyController from "#server/modules/transparency/transparency.controller.js";
import { createRateLimiter } from "#server/middleware/rateLimit.js";
import { healthRouter } from "../../modules/health/health.routes.js";
import * as healthController from "../../modules/health/health.controller.js";
import { zeradsCallbackHandler } from "#server/modules/zerads/zerads.controller.js";
import { offerwallMeRouter } from "#server/modules/offerwallme/index.js";

export function mountPublicSurfaceRoutes(app: Express): void {
  const publicLiveStatsLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
  });
  app.get("/api/live-server-stats", publicLiveStatsLimiter, publicLiveStatsController.getLiveStats);

  app.get("/api/public-stats", publicStatsController.getPublicStats);
  app.get("/api/public-feed", publicStatsController.getPublicFeed);
  app.use("/api/track", trafficRouter);

  app.use("/health", healthRouter);
  app.get("/metrics", healthController.metrics);

  app.get("/api/banners", bannerController.getActiveBanners);

  app.get("/api/transparency", transparencyController.getPublicEntries);
  app.get("/api/transparency/wallet-stats", transparencyController.getPublicWalletStats);
  app.get("/api/transparency/withdrawal-stats", transparencyController.getPublicWithdrawalStats);
  app.get("/api/transparency/wallets-live", transparencyController.getPublicTrackedWalletsLive);

  // Zerads PTC offerwall callback — called by Zerads server every ~5 min.
  // Security is handled inside the handler (IP + password guard).
  app.get("/zeradsptc.php", zeradsCallbackHandler);

  // Public test redirect — no auth required. Picks a random test user each hit.
  const ZERADS_TEST_USERS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
  app.get("/zerads", (_req, res) => {
    const u = ZERADS_TEST_USERS[Math.floor(Math.random() * ZERADS_TEST_USERS.length)];
    res.redirect(302, `https://zerads.com/ptc.php?ref=10776&user=${u}`);
  });

  // offerwall.me S2S postback — IP + MD5 signature verified inside handler.
  app.use("/api/offerwallme", offerwallMeRouter);
}
