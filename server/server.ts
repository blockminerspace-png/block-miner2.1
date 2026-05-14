import "dotenv/config";
import path from "path";
import { existsSync } from "fs";
import fs from "fs/promises";
import http from "http";
import crypto from "crypto";
import { fileURLToPath, pathToFileURL } from "url";
import express from "express";
import { Server } from "socket.io";

import prisma from "./src/db/prisma.js";
import { refreshIframeHostAllowlistCache } from "./services/internalOfferwall/iframeHostAllowlistCache.js";
import { MiningEngine } from "./src/miningEngine.js";
import { setMiningEngine } from "./src/miningEngineInstance.js";
import { setMiningEngine as setRuntimeMiningEngine } from "./src/runtime/miningRuntime.js";
import loggerLib, { logUnhandledError } from "./utils/logger.js";
import { findBlockMinerProjectRoot } from "./utils/projectRoot.js";
// Models & Utils
import { startCronTasks } from "./cron/index.js";
import {
  resumeDesiredStreamsAfterBoot,
  shutdownAllStreams,
  startStreamDesiredWatchdog
} from "./services/streaming/streamRunner.js";
import { startDepositVerifier } from "./services/depositVerifier.js";
import { startContractDepositSync } from "./services/contractDepositSync.js";
import { startPolygonHdDepositScanner } from "./services/polygonHdDepositScanner.js";
import { registerMinerSocketHandlers } from "./src/socket/registerMinerSocketHandlers.js";
import { registerGamesSocketHandlers } from "./src/socket/registerGamesSocketHandlers.js";
import { registerSupportSocketHandlers } from "./src/socket/registerSupportSocketHandlers.js";
import { setSupportIo } from "./services/supportRealtime.js";
import { verifyAdminJwtToken } from "./middleware/adminAuth.js";
import { getTokenFromRequest, getAdminTokenFromRequest } from "./utils/token.js";
import serverDatabaseModel from "./models/database/serverDatabaseModel.js";
import { getUserById } from "./models/userModel.js";
import { verifyAccessToken } from "./utils/authTokens.js";
import { attachSocketIoExplicitAuthMiddleware } from "./utils/socketHandshakeAuthPolicy.js";
import { getOrCreateMinerProfile, persistMinerProfile, syncUserBaseHashRate } from "./models/minerProfileModel.js";
import { ensureDefaultInternalReward } from "./models/shortlinkRewardModel.js";
import { ensureFaucetReward } from "./src/bootstrap/ensureFaucetReward.js";
import { startAuditOutboxWorker } from "./src/audit/index.js";
import { applyTrustProxy, buildSocketIoCorsConfig } from "./utils/corsConfig.js";
import { createHttpsEnforcementMiddleware } from "./middleware/httpsEnforcement.js";
import { runTurnstileStartupChecks } from "./middleware/turnstile.js";
import { errMsg } from "./types/tsNarrowing.js";

const logger = loggerLib.child("Server");

if (process.env.NODE_ENV !== "test") {
  runTurnstileStartupChecks();
}

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

const PROJECT_ROOT = findBlockMinerProjectRoot(__dirname);
const UPLOADS_STATIC_ROOT = path.resolve(process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, "uploads"));

const { setupExpressHttpStack } = await import(
  pathToFileURL(path.join(PROJECT_ROOT, "backend/dist/app/setupExpressHttpStack.js")).href
);
const { registerHttpRoutes } = await import(
  pathToFileURL(path.join(PROJECT_ROOT, "backend/dist/app/registerHttpRoutes.js")).href
);
const { apiErrorHandler } = await import(
  pathToFileURL(path.join(PROJECT_ROOT, "backend/dist/shared/http/apiErrorHandler.js")).href
);

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

/** Reject connections that send an explicit invalid JWT in `handshake.auth.token` (e.g. games SPA). */
attachSocketIoExplicitAuthMiddleware(io, { verifyAccessToken });

function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const ADMIN_ONLY_MODE = envFlag("ADMIN_ONLY_MODE", false);

// 1. Initialize Mining Engine
const engine = new MiningEngine();
setMiningEngine(engine);
setRuntimeMiningEngine(engine);
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
  } catch (err: unknown) {
    logger.error("Failed to bootstrap mining engine", { error: errMsg(err) });
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

    const concurrency = Math.min(
      32,
      Math.max(1, Math.floor(Number(process.env.MINING_ENGINE_BOOT_CONCURRENCY || 12)))
    );
    logger.info(`Syncing ${users.length} users into mining engine (concurrency=${concurrency})...`);

    for (let i = 0; i < users.length; i += concurrency) {
      const batch = users.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (user) => {
          const profile = await getOrCreateMinerProfile(user);
          if (profile.base_hash_rate > 0) {
            engine.createOrGetMiner({
              userId: user.id,
              username: profile.username || user.name,
              walletAddress: profile.walletAddress ?? null,
              profile: {
                rigs: profile.rigs,
                base_hash_rate: profile.base_hash_rate,
                balance: profile.balance,
                lifetimeMined: profile.lifetime_mined,
                refCode: profile.refCode,
                referralCount: profile.referralCount,
                mining_payout_mode: profile.mining_payout_mode
              }
            });
          }
        })
      );
    }
    logger.info("Engine sync complete.");
  } catch (error: unknown) {
    logger.error("Failed to sync engine miners", { error: errMsg(error) });
  }
}

// 2. Setup Database Persistence for the Engine
engine.setPersistBlockRewardsCallback(async (payload) => {
  try {
    await serverDatabaseModel.persistBlockRewards(payload);
  } catch (error: unknown) {
    logger.error("Engine persistence error", { error: errMsg(error) });
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

if (ADMIN_ONLY_MODE) {
  logger.info("ADMIN_ONLY_MODE enabled: public APIs and public SPA routes are restricted.");
}

setupExpressHttpStack(app, { ADMIN_ONLY_MODE });
registerHttpRoutes(app);

// 6. Static assets & frontend production build
// Serve user-uploaded miner images from the persistent volume (survives rebuilds)
app.use(
  "/uploads",
  express.static(UPLOADS_STATIC_ROOT, {
    setHeaders(res, filePath) {
      if (/\.svg$/i.test(filePath)) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'");
      } else if (/\.(png|jpe?g|webp|gif|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    }
  })
);

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
// acceptRanges: false — some mobile clients + HTTP/2 + nginx proxy stall on 206 Range chains
// for module scripts (DevTools: CSS 206, entry JS stuck "pending"). Full-file 200 is safer here.
app.use(
  express.static(publicPath, {
    index: false,
    acceptRanges: false,
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      if (/[-.][0-9A-Za-z_-]{7,}\.(m?js|css|wasm)$/i.test(base)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/\.(png|jpe?g|webp|gif|ico|svg)$/i.test(base)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
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
  if (ADMIN_ONLY_MODE && !req.path.startsWith("/admin")) {
    res.redirect(302, "/admin/login");
    return;
  }
  try {
    const indexPath = path.join(publicPath, "index.html");
    let html = await fs.readFile(indexPath, "utf8");

    const nonce = res.locals.cspNonce || "";
    const nonceAttr = nonce ? ` nonce="${nonce}"` : "";

    // CSP nonce for Turnstile (Cloudflare: put nonce on api.js; Turnstile propagates to child resources).
    html = html.replace(
      "<!--__BM_CSP_NONCE_BOOT__-->",
      nonce
        ? `<script${nonceAttr}>window.__BLOCKMINER_CSP_NONCE__=${JSON.stringify(nonce)}<\/script>`
        : "",
    );

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
      const injectScript = `<script${nonceAttr}>window.__BLOCKMINER_ENV__=${payload.replace(/</g, "\\u003c")}<\/script>`;
      if (html.includes("<!--__BM_RUNTIME_CONFIG__-->")) {
        html = html.replace("<!--__BM_RUNTIME_CONFIG__-->", injectScript);
      } else if (!html.includes("__BLOCKMINER_ENV__")) {
        html = html.replace("<head>", `<head>${injectScript}`);
      }
    } else {
      html = html.replace("<!--__BM_RUNTIME_CONFIG__-->", "");
    }

    // Inject the nonce into all script and style tags that have the placeholder
    html = html.replace(/__CSP_NONCE__/g, nonce);

    // Avoid stale index.html after deploy (prevents "Failed to fetch dynamically imported module" for old chunk hashes)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");

    res.send(html);
  } catch (error: unknown) {
    logger.error("Error serving index.html", { error: errMsg(error) });
    res.status(500).send("Internal Server Error");
  }
});

app.use(apiErrorHandler);

// 8. Bootstrap
async function bootstrap() {
  try {
      const port = Number(process.env.PORT) || 3000;
      const host = process.env.HOST || '0.0.0.0';
    // Ensure shortlink reward is correctly set up
    await ensureDefaultInternalReward().catch((err: unknown) =>
      logger.error("Failed to ensure shortlink reward", { error: errMsg(err) }),
    );
    await ensureFaucetReward().catch((err: unknown) =>
      logger.error("Failed to ensure faucet reward", { error: errMsg(err) }),
    );
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
      } catch (e: unknown) {
        logger.error("One-time shortlink reset failed", { error: errMsg(e) });
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
      } catch (e: unknown) {
        logger.error("BLK->POL mining mode migration failed", { error: errMsg(e) });
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
      } catch (e: unknown) {
        logger.error("Power expiry migration failed", { error: errMsg(e) });
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
        persistMinerProfile: (miner: unknown) =>
          persistMinerProfile(
            miner as { userId: number; balance: number; lastPersistedBalance?: number | undefined },
          ),
        syncUserBaseHashRate,
        buildPublicState: async (minerId) => engine.getPublicState(minerId),
      });
      startDepositVerifier();
      startContractDepositSync();
      startPolygonHdDepositScanner();
      if (process.env.NODE_ENV !== "test") {
        startAuditOutboxWorker();
      }
    });
  } catch (error: unknown) {
    logger.error("Bootstrap failed", { error: errMsg(error) });
    process.exit(1);
  }
}

bootstrap();
