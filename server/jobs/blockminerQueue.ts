/**
 * BullMQ queue for background jobs (API process enqueues; worker process consumes).
 */

import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { createBullmqConnection } from "./bullmqRedis.js";
import loggerLib from "../utils/logger.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("BullMQQueue");

export const BLOCKMINER_QUEUE_NAME = "blockminer-jobs";

let queue: Queue | null = null;
let publisherConnection: Redis | null = null;

export function isBullMqPublishingEnabled(): boolean {
  const disabled = String(process.env.BULLMQ_DISABLED || "")
    .trim()
    .toLowerCase();
  if (disabled === "1" || disabled === "true" || disabled === "yes") return false;
  return Boolean(String(process.env.REDIS_URL || "").trim());
}

export function getBlockminerQueue(): Queue | null {
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
    queue.on("error", (err: Error) => {
      logger.error("queue error", { message: err.message });
    });
  }
  return queue;
}

/**
 * @returns true if the job was enqueued (Redis + BullMQ available)
 */
export async function enqueueDepositPolygonScan(): Promise<boolean> {
  const q = getBlockminerQueue();
  if (!q) return false;
  try {
    await q.add(
      "deposit-polygon-scan",
      {},
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1500 },
      },
    );
    return true;
  } catch (e: unknown) {
    logger.warn("enqueueDepositPolygonScan failed", { message: errMsg(e) });
    return false;
  }
}

export type WelcomeEmailEnqueuePayload = {
  userId: number;
  email: string;
  displayName: string;
};

export type TournamentDepositProjectionJobData = {
  transactionId?: unknown;
  userId?: unknown;
  polAmount?: unknown;
  usdValue?: unknown;
  usdRate?: unknown;
  eventAt?: unknown;
  source?: unknown;
  countsForTournament?: unknown;
  txHash?: unknown;
};

export type TournamentActionProjectionJobData = {
  actionId?: unknown;
  userId?: unknown;
  provider?: unknown;
  actionCount?: unknown;
  executedAtUTC?: unknown;
  sourceId?: unknown;
  tournamentEligible?: unknown;
  metadata?: unknown;
};

export async function enqueueTournamentActionProjection(
  payload: TournamentActionProjectionJobData,
): Promise<boolean> {
  const q = getBlockminerQueue();
  if (!q) return false;
  const provider = String(payload.provider || "").trim();
  const sourceId = String(payload.sourceId || "").trim();
  if (!provider || !sourceId) return false;
  try {
    await q.add(
      "tournament-action-projection",
      payload,
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        jobId: `tournament-action-${provider}-${sourceId}`,
      },
    );
    return true;
  } catch (e: unknown) {
    logger.warn("enqueueTournamentActionProjection failed", { message: errMsg(e) });
    return false;
  }
}

export async function enqueueTournamentDepositProjection(
  payload: TournamentDepositProjectionJobData,
): Promise<boolean> {
  const q = getBlockminerQueue();
  if (!q) return false;
  const transactionId = Number(payload.transactionId);
  if (!Number.isFinite(transactionId) || transactionId <= 0) return false;
  try {
    await q.add(
      "tournament-deposit-projection",
      payload,
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        jobId: `tournament-deposit-${transactionId}`,
      },
    );
    return true;
  } catch (e: unknown) {
    logger.warn("enqueueTournamentDepositProjection failed", { message: errMsg(e) });
    return false;
  }
}

export async function enqueueTournamentOutboxDrain(): Promise<boolean> {
  const q = getBlockminerQueue();
  if (!q) return false;
  try {
    await q.add(
      "tournament-outbox-drain",
      {},
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1500 },
        jobId: `tournament-outbox-drain-${Date.now()}`,
      },
    );
    return true;
  } catch (e: unknown) {
    logger.warn("enqueueTournamentOutboxDrain failed", { message: errMsg(e) });
    return false;
  }
}

export async function enqueueWelcomeEmail(data: WelcomeEmailEnqueuePayload): Promise<boolean> {
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
      },
    );
    return true;
  } catch (e: unknown) {
    logger.warn("enqueueWelcomeEmail failed", { message: errMsg(e) });
    return false;
  }
}
