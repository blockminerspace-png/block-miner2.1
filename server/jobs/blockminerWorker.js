/**
 * BullMQ worker — run in a dedicated process/container (`node server/jobs/runBlockminerWorker.js`).
 */

import { Worker } from "bullmq";
import { createBullmqConnection } from "./bullmqRedis.js";
import { BLOCKMINER_QUEUE_NAME } from "./blockminerQueue.js";
import { scanForNewDeposits } from "../cron/depositsCron.js";
import { isSmtpConfigured, sendWelcomeEmail } from "../utils/mailer.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("BullMQWorker");

/**
 * @returns {import("bullmq").Worker}
 */
export function createBlockminerWorker() {
  const connection = createBullmqConnection();
  const worker = new Worker(
    BLOCKMINER_QUEUE_NAME,
    async (job) => {
      if (job.name === "deposit-polygon-scan") {
        const result = await scanForNewDeposits(true);
        logger.info("deposit-polygon-scan finished", {
          jobId: job.id,
          ok: result?.ok,
          reason: result?.reason,
        });
        return result;
      }

      if (job.name === "welcome-email") {
        const { email, displayName } = job.data || {};
        if (!isSmtpConfigured()) {
          logger.info("welcome-email skipped (SMTP not configured)", { jobId: job.id });
          return { ok: false, reason: "smtp_disabled" };
        }
        await sendWelcomeEmail({ to: String(email || "").trim(), name: displayName });
        return { ok: true };
      }

      logger.warn("unknown job name", { jobId: job.id, name: job.name });
      return { ok: false, reason: "unknown_job" };
    },
    {
      connection,
      concurrency: Math.max(1, Math.min(8, Number(process.env.BULLMQ_CONCURRENCY || 4) || 4)),
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("job failed", {
      jobId: job?.id,
      name: job?.name,
      error: err?.message || String(err),
    });
  });

  return worker;
}
