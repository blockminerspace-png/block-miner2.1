import "dotenv/config";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";

import prisma from "./src/db/prisma.js";
import { MiningEngine } from "./src/miningEngine.js";
import { setMiningEngine } from "./src/miningEngineInstance.js";
import loggerLib from "./utils/logger.js";

// Middlewares
import { createRateLimiter } from "./middleware/rateLimit.js";
import { createCspMiddleware } from "./middleware/csp.js";
import { createCsrfMiddleware } from "./middleware/csrf.js";

// Routes
import { authRouter } from "./routes/auth.js";
import { faucetRouter } from "./routes/faucet.js";
import { walletRouter } from "./routes/wallet.js";
import { shopRouter } from "./routes/shop.js";
import { inventoryRouter } from "./routes/inventory.js";
import { machinesRouter } from "./routes/machines.js";
import { racksRouter } from "./routes/racks.js";
import { checkinRouter } from "./routes/checkin.js";
import { chatRouter } from "./routes/chat.js";
import { rankingRouter } from "./routes/ranking.js";
import { shortlinkRouter } from "./routes/shortlink.js";
import { zeradsRouter } from "./routes/zerads.js";
import { youtubeRouter } from "./routes/youtube.js";
import { autoMiningGpuRouter } from "./routes/auto-mining-gpu.js";
import { sessionRouter } from "./routes/session.js";
import { notificationRouter } from "./routes/notification.js";
import { swapRouter } from "./routes/swap.js";
import { ptpRouter } from "./routes/ptp.js";
import { adminAuthRouter } from "./routes/admin-auth.js";
import { adminAutoMiningRewardsRouter } from "./routes/admin-auto-mining-rewards.js";
import * as healthController from "./controllers/healthController.js";

// Models & Utils
import { startCronTasks } from "./cron/index.js";
import { registerMinerSocketHandlers } from "./src/socket/registerMinerSocketHandlers.js";
import { registerGamesSocketHandlers } from "./src/socket/registerGamesSocketHandlers.js";
import serverDatabaseModel from "./models/database/serverDatabaseModel.js";
import { getUserById } from "./models/userModel.js";
import { verifyAccessToken } from "./utils/authTokens.js";
import { getOrCreateMinerProfile, persistMinerProfile, syncUserBaseHashRate } from "./models/minerProfileModel.js";

const logger = loggerLib.child("Server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 1. Initialize Mining Engine
const engine = new MiningEngine();
setMiningEngine(engine);
engine.setIo(io);

// 1.1 Preload historical blocks into memory
serverDatabaseModel.loadRecentBlocks(12).then(blocks => {
  if (blocks && blocks.length > 0) {
    engine.blockHistory = blocks.map(b => ({
      blockNumber: b.blockNumber,
      reward: b.reward,
      minerCount: b.minerCount,
      timestamp: b.timestamp,
      userRewards: b.userRewards
    }));
    logger.info(`Preloaded ${blocks.length} recent blocks into engine memory.`);
  }
}).catch(err => logger.error("Failed to preload block history", { error: err.message }));
engine.setProfileLoader(async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) return getOrCreateMinerProfile(user);
  return null;
});

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

// 4. Global Security Stack
app.use(helmet({ contentSecurityPolicy: false }));
app.use(createCspMiddleware());
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : "*",
  credentials: true
}));
app.use(express.json({ limit: "10kb" }));
app.use(createCsrfMiddleware());

// Global Rate Limiter
const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again later."
});
app.use("/api", globalLimiter);

app.use("/api", (req, res, next) => {
  logger.info(`INCOMING API REQUEST: ${req.method} ${req.originalUrl}`);
  next();
});

// 5. API Routes
app.use("/api/auth", authRouter);
app.use("/api/faucet", faucetRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/shop", shopRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/machines", machinesRouter);
app.use("/api/racks", racksRouter);
app.use("/api/checkin", checkinRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/shortlink", shortlinkRouter);
app.use("/api/zerads", zeradsRouter);
app.use("/api/youtube", youtubeRouter);
app.use("/api/auto-mining-gpu", autoMiningGpuRouter);
app.use("/api/session", sessionRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/swap", swapRouter);
app.use("/api/ptp", ptpRouter);

// 6. Admin Routes
import { adminRouter } from "./routes/admin.js";
app.use("/api/admin", adminRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin/auto-mining-rewards", adminAutoMiningRewardsRouter);

// Health check
app.get("/health", healthController.health);

// 7. Static Assets & Frontend Production Build
const publicPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(publicPath));

// Express 5 / path-to-regexp 8+ catch-all syntax
app.get("/{*all}", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// 8. Bootstrap
async function bootstrap() {
  try {
    const port = process.env.PORT || 5000;
    server.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      
      // Start background tasks
      startCronTasks({
        engine,
        io,
        persistMinerProfile,
        syncUserBaseHashRate,
        buildPublicState: async (minerId) => engine.getPublicState(minerId)
      });
    });
  } catch (error) {
    logger.error("Bootstrap failed", { error: error.message });
    process.exit(1);
  }
}

bootstrap();
