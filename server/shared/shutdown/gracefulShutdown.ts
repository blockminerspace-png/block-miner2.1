import type { Server as HttpServer } from "node:http";
import type { Server as SocketServer } from "socket.io";
import prisma from "../../src/db/prisma.js";
import { shutdownRedis } from "../../services/redisClient.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("GracefulShutdown");

let shuttingDown = false;

const SHUTDOWN_TIMEOUT_MS =
  Number.parseInt(String(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || "25000"), 10) || 25000;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function registerGracefulShutdown(httpServer: HttpServer, socketIo: SocketServer): void {
  const handle = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutdown_started", { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });

    const forceTimer = setTimeout(() => {
      logger.warn("shutdown_forced", { reason: "timeout" });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    const closeHttp = new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) logger.warn("http_close_error", { message: err.message });
        resolve();
      });
    });

    const closeSockets = new Promise<void>((resolve) => {
      socketIo.close(() => resolve());
    });

    void Promise.all([closeHttp, closeSockets])
      .then(async () => {
        try {
          await shutdownRedis();
        } catch (e: unknown) {
          logger.warn("redis_shutdown_error", {
            message: e instanceof Error ? e.message : String(e),
          });
        }
        try {
          await prisma.$disconnect();
        } catch (e: unknown) {
          logger.warn("prisma_disconnect_error", {
            message: e instanceof Error ? e.message : String(e),
          });
        }
        logger.info("shutdown_complete", { signal });
        clearTimeout(forceTimer);
        process.exit(0);
      })
      .catch((e: unknown) => {
        logger.error("shutdown_failed", { message: e instanceof Error ? e.message : String(e) });
        clearTimeout(forceTimer);
        process.exit(1);
      });
  };

  process.once("SIGTERM", () => handle("SIGTERM"));
  process.once("SIGINT", () => handle("SIGINT"));
}
