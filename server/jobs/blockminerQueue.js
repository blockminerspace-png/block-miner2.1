/**
 * BullMQ queue for background jobs (API process enqueues; worker process consumes).
 */

import { Queue } from "bullmq";
import { createBullmqConnection } from "./bullmqRedis.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("BullMQQueue");

export const BLOCKMINER_QUEUE_NAME = "blockminer-jobs";

/** @type {import("bullmq").Queue | null} */
let queue = null;

/** @type {import("ioredis").default | null} */
let publisherConnection = null;

export function isBullMqPublishingEnabled() {
  const disabled = String(process.env.BULLMQ_DISABLED || "")
    .trim()
    .toLowerCase();
  if (disabled === "1" || disabled === "true" || disabled === "yes") return false;
  return Boolean(String(process.env.REDIS_URL || "").trim());
}

/**
 * @returns {import("bullmq").Queue | null}
 */
export function getBlockminerQueue() {
  if (!isBullMqPublishingEnabled()) return null;
  if (!queue) {
    publisherConnection = createBullmqConnection();
    queue = new Queue(BLOCKMINER_QUEUE_NAME, {
      connection: publisherConnection,
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
    queue.on("error", (err) => {
      logger.error("queue error", { message: err?.message || String(err) });
    });
  }
  return queue;
}

/**
 * @returns {Promise<boolean>} true if the job was enqueued (Redis + BullMQ available)
 */
export async function enqueueDepositPolygonScan() {
  const q = getBlockminerQueue();
  if (!q) return false;
  try {
    await q.add(
      "deposit-polygon-scan",
      {},
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1500 },
      }
    );
    return true;
  } catch (e) {
    logger.warn("enqueueDepositPolygonScan failed", { message: /** @type {Error} */ (e)?.message || String(e) });
    return false;
  }
}

/**
 * @param {{ userId: number, email: string, displayName: string }} data
 * @returns {Promise<boolean>}
 */
export async function enqueueWelcomeEmail(data) {
  const q = getBlockminerQueue();
  if (!q) return false;
  const userId = Number(data.userId);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  const email = String(data.email || "").trim();
  if (!email) return false;
  try {
    await q.add(
      "welcome-email",
      {
        userId,
        email,
        displayName: String(data.displayName || "").trim() || "Miner",
      },
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        jobId: `welcome-email-${userId}`,
      }
    );
    return true;
  } catch (e) {
    logger.warn("enqueueWelcomeEmail failed", { message: /** @type {Error} */ (e)?.message || String(e) });
    return false;
  }
}
