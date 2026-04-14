import "dotenv/config";
import path from "path";
import { existsSync } from "fs";
import fs from "fs/promises";
import http from "http";
import crypto from "crypto";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";

import prisma from "./src/db/prisma.js";
import { refreshIframeHostAllowlistCache } from "./services/internalOfferwall/iframeHostAllowlistCache.js";
import { MiningEngine } from "./src/miningEngine.js";
import { setMiningEngine } from "./src/miningEngineInstance.js";
import loggerLib, { logUnhandledError } from "./utils/logger.js";
// Middlewares
import { createRateLimiter } from "./middleware/rateLimit.js";
import { createDistributedRateLimiter } from "./middleware/distributedRateLimit.js";
import { createHttpsEnforcementMiddleware } from "./middleware/httpsEnforcement.js";
import { getHelmetContentSecurityPolicyOptions } from "./middleware/csp.js";
import { createCsrfMiddleware } from "./middleware/csrf.js";

// Routes
import { authRouter } from "./routes/auth.js";
import { faucetRouter } from "./routes/faucet.js";
import { walletRouter } from "./routes/wallet.js";
import { miningRouter } from "./routes/mining.js";
import { depositTicketRouter } from "./routes/deposit-tickets.js";
import { shopRouter } from "./routes/shop.js";
import { inventoryRouter } from "./routes/inventory.js";
import { machinesRouter } from "./routes/machines.js";
import { racksRouter } from "./routes/racks.js";
import vaultRouter from "./routes/vault.js";
import { readEarnRouter } from "./routes/read-earn.js";
import { roomsRouter } from "./routes/rooms.js";
import { checkinRouter } from "./routes/checkin.js";
import { offerEventsRouter } from "./routes/offer-events.js";
import { miniPassRouter } from "./routes/mini-pass.js";
import { dailyTasksRouter } from "./routes/daily-tasks.js";
import { internalOfferwallRouter } from "./routes/internal-offerwall.js";
import { chatRouter } from "./routes/chat.js";
import { rankingRouter } from "./routes/ranking.js";
import { statsRouter } from "./routes/stats.js";
import { shortlinkRouter } from "./routes/shortlink.js";
import { youtubeRouter } from "./routes/youtube.js";
import { gamesRouter } from "./routes/games.js";
import { autoMiningGpuRouter } from "./routes/auto-mining-gpu.js";
import { sessionRouter } from "./routes/session.js";
import { notificationRouter } from "./routes/notification.js";
import { broadcastRouter } from "./routes/broadcast.js";
import { swapRouter } from "./routes/swap.js";
import { ptpRouter } from "./routes/ptp.js";
import { adminAuthRouter } from "./routes/admin-auth.js";
import { adminAutoMiningRewardsRouter } from "./routes/admin-auto-mining-rewards.js";
import supportRouter from "./routes/support.js";
import userRouter from "./routes/user.js";
import { sidebarNavRouter } from "./routes/sidebar-nav.js";
import * as publicLiveStatsController from "./controllers/publicLiveStatsController.js";
import * as healthController from "./controllers/healthController.js";
import { handleBtcpayWebhook } from "./controllers/btcpayWebhookController.js";
import * as bannerController from "./controllers/bannerController.js";
import * as transparencyController from "./controllers/transparencyController.js";
// Models & Utils
import { startCronTasks } from "./cron/index.js";
import {
  resumeDesiredStreamsAfterBoot,
  shutdownAllStreams,
  startStreamDesiredWatchdog
} from "./services/streaming/streamRunner.js";
import { startDepositVerifier } from "./services/depositVerifier.js";
import { startContractDepositSync } from "./services/contractDepositSync.js";
import { registerMinerSocketHandlers } from "./src/socket/registerMinerSocketHandlers.js";
import { registerGamesSocketHandlers } from "./src/socket/registerGamesSocketHandlers.js";
import { registerSupportSocketHandlers } from "./src/socket/registerSupportSocketHandlers.js";
import { setSupportIo } from "./services/supportRealtime.js";
import { verifyAdminJwtToken } from "./middleware/adminAuth.js";
import { getTokenFromRequest, getAdminTokenFromRequest } from "./utils/token.js";
import serverDatabaseModel from "./models/database/serverDatabaseModel.js";
import { getUserById } from "./models/userModel.js";
import { verifyAccessToken } from "./utils/authTokens.js";
import { getOrCreateMinerProfile, persistMinerProfile, syncUserBaseHashRate } from "./models/minerProfileModel.js";
import { ensureDefaultInternalReward } from "./models/shortlinkRewardModel.js";
import { ensureFaucetReward } from "./src/bootstrap/ensureFaucetReward.js";
import { auditContextMiddleware, startAuditOutboxWorker } from "./src/audit/index.js";
import {
  applyTrustProxy,
  buildExpressCorsOptions,
  buildSocketIoCorsConfig
} from "./utils/corsConfig.js";
import { createHttpRequestLogger } from "./middleware/httpRequestLogger.js";

const logger = loggerLib.child("Server");

if (process.env.NODE_ENV !== "test") {
  process.on("unhandledRejection", (reason) => {
    const err =
      reason instanceof Error
        ? reason
        : new Error(typeof reason === "string" ? reason : JSON.stringify(reason));
    logUnhandledError(err, null, { source: "unhandledRejection" });
  });
  process.on("uncaughtException", (err) => {
    logUnhandledError(err instanceof Error ? err : new Error(String(err)), null, {
      source: "uncaughtException",
    });
  });
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
applyTrustProxy(app);
app.use(createHttpsEnforcementMiddleware());
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64url");
  next();
});
const server = http.createServer(app);
const io = new Server(server, {
  cors: buildSocketIoCorsConfig()
});

function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

// 1. Initialize Mining Engine
const engine = new MiningEngine();
setMiningEngine(engine);
engine.setIo(io);

// 1.1 Preload historical blocks into memory
const bootstrapEngine = async () => {
  try {
    const blocks = await serverDatabaseModel.loadRecentBlocks(12);
    if (blocks && blocks.length > 0) {
      engine.blockHistory = blocks.map(b => ({
        blockNumber: b.blockNumber,
        reward: b.reward,
        minerCount: b.minerCount,
        timestamp: b.timestamp,
        userRewards: b.userRewards
      }));
    }

    const [maxDist, maxLog] = await Promise.all([
      prisma.blockDistribution.aggregate({ _max: { blockNumber: true } }),
      prisma.miningRewardsLog.aggregate({ _max: { blockNumber: true } })
    ]);

    const currentMax = Math.max(maxDist._max.blockNumber || 0, maxLog._max.blockNumber || 0);
    engine.blockNumber = currentMax + 1;

    logger.info(`Engine bootstrap complete. Current Block: #${currentMax}. Next: #${engine.blockNumber}`);
    
    // 1.2 Sync miners after block initialization
    await syncEngineMiners(engine);
  } catch (err) {
    logger.error("Failed to bootstrap mining engine", { error: err.message });
  }
};

bootstrapEngine();

engine.setProfileLoader(async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) return getOrCreateMinerProfile(user);
  return null;
});

// 1.2 Function to sync all active users with the engine
async function syncEngineMiners(engine) {
  try {
    const users = await prisma.user.findMany({
      where: { isBanned: false }
    });
    
    logger.info(`Syncing ${users.length} users into mining engine...`);
    
    for (const user of users) {
      const profile = await getOrCreateMinerProfile(user);
      if (profile.base_hash_rate > 0) {
        engine.createOrGetMiner({
          userId: user.id,
          username: profile.username || user.name,
          walletAddress: profile.wallet_address,
          profile: {
            rigs: profile.rigs,
            base_hash_rate: profile.base_hash_rate,
            balance: profile.balance,
            lifetimeMined: profile.lifetime_mined,
            refCode: profile.refCode,
            referralCount: profile.referralCount
          }
        });
      }
    }
    logger.info("Engine sync complete.");
  } catch (error) {
    logger.error("Failed to sync engine miners", { error: error.message });
  }
}

// 2. Setup Database Persistence for the Engine
engine.setPersistBlockRewardsCallback(async (payload) => {
  try {
    await serverDatabaseModel.persistBlockRewards(payload);
  } catch (error) {
    logger.error("Engine persistence error", { error: error.message });
    throw error;
  }
});

// 3. Register Socket Handlers
registerMinerSocketHandlers({
  io,
  engine,
  verifyAccessToken,
  getUserById,
  getOrCreateMinerProfile,
  syncUserBaseHashRate,
  persistMinerProfile,
  buildPublicState: async (minerId) => engine.getPublicState(minerId)
});

registerGamesSocketHandlers({
  io,
  engine
});

setSupportIo(io);
registerSupportSocketHandlers({
  io,
  verifyAccessToken,
  verifyAdminJwtToken,
  getTokenFromRequest,
  getAdminTokenFromRequest
});

// 4. Global Security Stack
app.use(
  helmet({
    contentSecurityPolicy: getHelmetContentSecurityPolicyOptions(),
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }),
);
app.use(cors(buildExpressCorsOptions()));

/**
 * BTCPay webhook must read the raw body for HMAC verification (before express.json consumes it).
 */
const btcpayWebhookLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 300,
  message: "Too many BTCPay webhook requests."
});
app.post(
  "/api/payments/btcpay/webhook",
  btcpayWebhookLimiter,
  express.raw({
    type: () => true,
    limit: "4mb"
  }),
  handleBtcpayWebhook
);

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "1mb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use(createCsrfMiddleware());

// Global Rate Limiter (Redis-backed when REDIS_URL is configured)
const globalLimiter = createDistributedRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  name: "api_global",
  skip: (req) => {
    const skipPaths = ["/api/session/heartbeat", "/api/wallet/balance", "/api/checkin/status"];
    return skipPaths.includes(req.originalUrl);
  },
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api", auditContextMiddleware);
app.use("/api", globalLimiter);
app.use("/api", createHttpRequestLogger());

// 5. API Routes
app.use("/api/auth", authRouter);
app.use("/api/faucet", faucetRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/mining", miningRouter);
app.use("/api/deposit-tickets", depositTicketRouter);
app.use("/api/shop", shopRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/machines", machinesRouter);
app.use("/api/racks", racksRouter);
app.use("/api/vault", vaultRouter);
app.use("/api/read-earn", readEarnRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/checkin", checkinRouter);
app.use("/api/offer-events", offerEventsRouter);
app.use("/api/mini-pass", miniPassRouter);
app.use("/api/daily-tasks", dailyTasksRouter);
app.use("/api/internal-offerwall", internalOfferwallRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/stats", statsRouter);
app.use("/api/shortlink", shortlinkRouter);
app.use("/api/youtube", youtubeRouter);
app.use("/api/games", gamesRouter);
app.use("/api/auto-mining-gpu", autoMiningGpuRouter);
app.use("/api/session", sessionRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/broadcast", broadcastRouter);
app.use("/api/swap", swapRouter);
app.use("/api/support", supportRouter);
app.use("/api/user", userRouter);
app.use("/api/sidebar", sidebarNavRouter);
// app.use("/api/ptp", ptpRouter);

// 6. Admin Routes
import { adminRouter } from "./routes/admin.js";
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/auto-mining-rewards", adminAutoMiningRewardsRouter);

const publicLiveStatsLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
});
app.get("/api/live-server-stats", publicLiveStatsLimiter, publicLiveStatsController.getLiveStats);

// Public stats (no auth — used by Landing page)
app.get("/api/public-stats", async (req, res) => {
  try {
    const [userCount, withdrawnAgg, activeMiners] = await Promise.all([
      prisma.user.count(),
      prisma.transaction.aggregate({
        where: { type: "withdrawal", status: "completed" },
        _sum: { amount: true },
      }),
      prisma.userMiner.count({ where: { isActive: true } }),
    ]);
    res.json({
      ok: true,
      users: userCount,
      totalWithdrawn: Number(withdrawnAgg._sum.amount || 0),
      activeMiners,
      launchDate: "2026-03-05T00:00:00.000Z",
    });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// Health check
app.get("/health", healthController.health);

// Active banners (no auth — used by Dashboard)
app.get("/api/banners", bannerController.getActiveBanners);

// Transparency portal (no auth — public)
app.get("/api/transparency", transparencyController.getPublicEntries);

// 7. Static Assets & Frontend Production Build
// Serve user-uploaded miner images from the persistent volume (survives rebuilds)
app.use('/uploads', express.static('/app/uploads'));

const publicPath = path.join(__dirname, "..", "client", "dist");
// Static crypto broadcast board (TradingView, etc.) — NOT under /dashboardcrypto so the SPA route
// `/dashboardcrypto` works like `/liveserver` (no competing Express handlers → no redirect loops).
const cryptoBroadcastDist = path.join(publicPath, "crypto-broadcast");
const cryptoBroadcastSrc = path.join(__dirname, "..", "client", "public", "crypto-broadcast");
const cryptoBroadcastRoot = existsSync(path.join(cryptoBroadcastDist, "index.html"))
  ? cryptoBroadcastDist
  : cryptoBroadcastSrc;
const cryptoBroadcastIndexPath = path.join(cryptoBroadcastRoot, "index.html");

function sendCryptoBroadcastIndex(res, next) {
  if (!existsSync(cryptoBroadcastIndexPath)) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.type("html");
  res.sendFile(cryptoBroadcastIndexPath, (err) => {
    if (err) next(err);
  });
}

app.get("/crypto-broadcast", (_req, res, next) => sendCryptoBroadcastIndex(res, next));
app.get("/crypto-broadcast/", (_req, res, next) => sendCryptoBroadcastIndex(res, next));

app.use(
  "/crypto-broadcast",
  express.static(cryptoBroadcastRoot, {
    index: false,
    setHeaders(res, filePath) {
      if (/\.html$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      }
    }
  })
);

// Hashed Vite assets can be cached forever; unhashed JS/CSS must revalidate so users never
// stick on an old bundle after deploy (stale check-in UI, etc.).
app.use(
  express.static(publicPath, {
    index: false,
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      if (/[-.][0-9A-Za-z_-]{7,}\.(m?js|css|wasm)$/i.test(base)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/\.(m?js|css|wasm)$/i.test(base)) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// Express 5 / path-to-regexp 8+ catch-all syntax
app.get("/{*all}", async (req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  try {
    const indexPath = path.join(publicPath, "index.html");
    let html = await fs.readFile(indexPath, "utf8");

    // WalletConnect: SPA may be built without VITE_*; Node still has .env.production at runtime.
    const wcId = String(process.env.VITE_WALLETCONNECT_PROJECT_ID || "").trim();
    const wcAppUrl = String(
      process.env.VITE_PUBLIC_WALLET_APP_URL || process.env.APP_URL || ""
    )
      .trim()
      .replace(/\/+$/, "");
    if (wcId) {
      const payload = JSON.stringify({
        VITE_WALLETCONNECT_PROJECT_ID: wcId,
        ...(wcAppUrl ? { VITE_PUBLIC_WALLET_APP_URL: wcAppUrl } : {}),
      });
      const injectScript = `<script>window.__BLOCKMINER_ENV__=${payload.replace(/</g, "\\u003c")}</script>`;
      if (html.includes("<!--__BM_RUNTIME_CONFIG__-->")) {
        html = html.replace("<!--__BM_RUNTIME_CONFIG__-->", injectScript);
      } else if (!html.includes("__BLOCKMINER_ENV__")) {
        html = html.replace("<head>", `<head>${injectScript}`);
      }
    } else {
      html = html.replace("<!--__BM_RUNTIME_CONFIG__-->", "");
    }

    // Inject the nonce into all script and style tags that have the placeholder
    const nonce = res.locals.cspNonce || "";
    html = html.replace(/__CSP_NONCE__/g, nonce);

    // Avoid stale index.html after deploy (prevents "Failed to fetch dynamically imported module" for old chunk hashes)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");

    res.send(html);
  } catch (error) {
    logger.error("Error serving index.html", { error: error.message });
    res.status(500).send("Internal Server Error");
  }
});

app.use((err, req, res, next) => {
  logUnhandledError(err instanceof Error ? err : new Error(String(err)), req, { source: "express" });
  if (res.headersSent) {
    next(err);
    return;
  }
  if (req.path && String(req.path).startsWith("/api")) {
    res.status(500).json({ ok: false, message: "Internal server error." });
    return;
  }
  res.status(500).send("Internal Server Error");
});

// 8. Bootstrap
async function bootstrap() {
  try {
      const port = process.env.PORT || 3000;
      const host = process.env.HOST || '0.0.0.0';
    // Ensure shortlink reward is correctly set up
    await ensureDefaultInternalReward().catch(err => logger.error("Failed to ensure shortlink reward", { error: err.message }));
    await ensureFaucetReward().catch(err => logger.error("Failed to ensure faucet reward", { error: err.message }));
    await refreshIframeHostAllowlistCache(prisma).catch((err) =>
      logger.error("Failed to warm internal offerwall iframe allowlist cache", {
        error: String(err?.message || err)
      })
    );

    if (envFlag("RUN_STARTUP_DATA_MIGRATIONS", false)) {
      // --- ONE-TIME SCRIPT: Reset all shortlinks on startup ---
      try {
        logger.info("Running one-time shortlink reset for all users...");
        const { count } = await prisma.shortlinkCompletion.updateMany({
          where: { dailyRuns: { gt: 0 } },
          data: { dailyRuns: 0, resetAt: new Date() }
        });
        logger.info(`One-time reset completed for ${count} users.`);
      } catch (e) {
        logger.error("One-time shortlink reset failed", { error: e.message });
      }
      // --- END ONE-TIME SCRIPT ---

      // --- MIGRATION GUARD: remove legacy BLK mining mode (POL-only) ---
      try {
        const { count } = await prisma.user.updateMany({
          where: { miningPayoutMode: "blk" },
          data: { miningPayoutMode: "pol" }
        });
        if (count > 0) {
          logger.info(`Converted ${count} user(s) from BLK mining mode to POL.`);
        }
      } catch (e) {
        logger.error("BLK->POL mining mode migration failed", { error: e.message });
      }
      // --- END MIGRATION GUARD ---

      // --- MIGRATION: Extend game/yt powers created with 24h to GAME_POWER_DAYS ---
      try {
        const GAME_POWER_DAYS = Number(process.env.GAME_POWER_DAYS) || 7;
        const YT_POWER_DAYS = Number(process.env.YT_POWER_DAYS) || 7;
        const now = new Date();
        const cutoffCreated = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const shortExpiryThreshold = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

        const oldGamePowers = await prisma.userPowerGame.findMany({
          where: { playedAt: { gt: cutoffCreated }, expiresAt: { gt: now, lt: shortExpiryThreshold } },
          select: { id: true, playedAt: true }
        });
        for (const p of oldGamePowers) {
          const newExpiry = new Date(p.playedAt.getTime() + GAME_POWER_DAYS * 24 * 60 * 60 * 1000);
          await prisma.userPowerGame.update({ where: { id: p.id }, data: { expiresAt: newExpiry } });
        }
        if (oldGamePowers.length > 0) {
          logger.info(`Migrated ${oldGamePowers.length} game powers to ${GAME_POWER_DAYS}-day expiry.`);
        }

        const oldYtPowers = await prisma.youtubeWatchPower.findMany({
          where: { claimedAt: { gt: cutoffCreated }, expiresAt: { gt: now, lt: shortExpiryThreshold } },
          select: { id: true, claimedAt: true }
        });
        for (const p of oldYtPowers) {
          const newExpiry = new Date(p.claimedAt.getTime() + YT_POWER_DAYS * 24 * 60 * 60 * 1000);
          await prisma.youtubeWatchPower.update({ where: { id: p.id }, data: { expiresAt: newExpiry } });
        }
        if (oldYtPowers.length > 0) {
          logger.info(`Migrated ${oldYtPowers.length} YT powers to ${YT_POWER_DAYS}-day expiry.`);
        }
      } catch (e) {
        logger.error("Power expiry migration failed", { error: e.message });
      }
      // --- END MIGRATION ---
    } else {
      logger.info("Startup data migrations disabled (RUN_STARTUP_DATA_MIGRATIONS=false).");
    }

    server.listen(port, host, () => {
      logger.info(`Server running on ${host}:${port}`);

      const shutdownStreams = () => {
        shutdownAllStreams().catch(() => {});
      };
      process.once("SIGINT", shutdownStreams);
      process.once("SIGTERM", shutdownStreams);

      if (process.env.NODE_ENV !== "test") {
        setTimeout(() => {
          void resumeDesiredStreamsAfterBoot().catch((err) =>
            logger.error("resume streaming after boot failed", {
              error: String(err?.message || err)
            })
          );
        }, 8000);
        startStreamDesiredWatchdog();
      }

      // Start background tasks
      startCronTasks({
        engine,
        io,
        persistMinerProfile,
        syncUserBaseHashRate,
        buildPublicState: async (minerId) => engine.getPublicState(minerId)
      });
      startDepositVerifier();
      startContractDepositSync();
      if (process.env.NODE_ENV !== "test") {
        startAuditOutboxWorker();
      }
    });
  } catch (error) {
    logger.error("Bootstrap failed", { error: error.message });
    process.exit(1);
  }
}

bootstrap();
