/**
 * BullMQ worker — run in a dedicated process/container (`node dist/server/jobs/runBlockminerWorker.js`).
 */

import { Worker, type Job } from "bullmq";
import { createBullmqConnection } from "./bullmqRedis.js";
import { BLOCKMINER_QUEUE_NAME } from "./blockminerQueue.js";
import { scanForNewDeposits } from "../cron/depositsCron.js";
import { isSmtpConfigured, sendWelcomeEmail } from "../utils/mailer.js";
import loggerLib from "../utils/logger.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("BullMQWorker");

export type WelcomeEmailJobData = {
  email?: unknown;
  displayName?: unknown;
};

export function createBlockminerWorker(): Worker {
  const connection = createBullmqConnection();
  const worker = new Worker(
    BLOCKMINER_QUEUE_NAME,
    async (job: Job) => {
      if (job.name === "deposit-polygon-scan") {
        const result = await scanForNewDeposits(true);
        logger.info("deposit-polygon-scan finished", {
          jobId: job.id,
          ok: result.ok,
          reason: result.reason,
        });
        return result;
      }

      if (job.name === "welcome-email") {
        const data = (job.data || {}) as WelcomeEmailJobData;
        const { email, displayName } = data;
        if (!isSmtpConfigured()) {
          logger.info("welcome-email skipped (SMTP not configured)", { jobId: job.id });
          return { ok: false, reason: "smtp_disabled" };
        }
        await sendWelcomeEmail({
          to: String(email || "").trim(),
          name: String(displayName ?? "").trim() || undefined,
        });
        return { ok: true };
      }

      logger.warn("unknown job name", { jobId: job.id, name: job.name });
      return { ok: false, reason: "unknown_job" };
    },
    {
      connection,
      concurrency: Math.max(1, Math.min(8, Number(process.env.BULLMQ_CONCURRENCY || 4) || 4)),
    },
  );

  worker.on("failed", (job: Job | undefined, err: unknown) => {
    logger.error("job failed", {
      jobId: job?.id,
      name: job?.name,
      error: errMsg(err),
    });
  });

  return worker;
}
