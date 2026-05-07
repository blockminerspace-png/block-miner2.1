/**
 * Entry point for the BullMQ worker container.
 * Does not start Express or Socket.IO — only consumes Redis-backed jobs.
 */
import "dotenv/config";
import { createBlockminerWorker } from "./blockminerWorker.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("BullMQWorkerMain");

const worker = createBlockminerWorker();
logger.info("BlockMiner BullMQ worker started", { queue: "blockminer-jobs" });

async function shutdown(signal) {
  logger.info("shutdown", { signal });
  try {
    await worker.close();
  } catch (e) {
    logger.warn("worker.close error", { message: /** @type {Error} */ (e)?.message || String(e) });
  }
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
