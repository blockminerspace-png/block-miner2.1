/**
 * BullMQ worker — run in a dedicated process/container (`node dist/server/jobs/runBlockminerWorker.js`).
 */

import { Worker, type Job } from "bullmq";
import { createBullmqConnection } from "./bullmqRedis.js";
import { BLOCKMINER_QUEUE_NAME } from "./blockminerQueue.js";
import { scanForNewDeposits } from "../cron/depositsCron.js";
import { isSmtpConfigured, sendWelcomeEmail } from "../utils/mailer.js";
import { processTournamentOutboxBatch } from "../modules/tournaments/infrastructure/outbox/tournament-outbox.processor.js";
import { onDepositConfirmedEvent } from "../modules/tournaments/application/handlers/deposit-confirmed.handler.js";
import { onTournamentActionEvent } from "../modules/tournaments/application/handlers/tournament-action.handler.js";
import type { DepositConfirmedPayload } from "../modules/tournaments/domain/events/deposit-confirmed.event.js";
import type { TournamentActionPayload } from "../modules/tournaments/domain/events/tournament-action.event.js";
import type {
  TournamentActionProjectionJobData,
  TournamentDepositProjectionJobData,
} from "./blockminerQueue.js";
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

      if (job.name === "tournament-outbox-drain") {
        const count = await processTournamentOutboxBatch();
        logger.info("tournament-outbox-drain finished", { jobId: job.id, count });
        return { ok: true, count };
      }

      if (job.name === "tournament-deposit-projection") {
        const data = (job.data || {}) as TournamentDepositProjectionJobData;
        const payload: DepositConfirmedPayload = {
          transactionId: Number(data.transactionId),
          userId: Number(data.userId),
          polAmount: Number(data.polAmount),
          usdValue: Number(data.usdValue),
          usdRate: Number(data.usdRate),
          eventAt: String(data.eventAt || ""),
          source: String(data.source || ""),
          countsForTournament: Boolean(data.countsForTournament),
          txHash: data.txHash != null ? String(data.txHash) : null,
        };
        await onDepositConfirmedEvent(payload);
        return { ok: true };
      }

      if (job.name === "tournament-action-projection") {
        const data = (job.data || {}) as TournamentActionProjectionJobData;
        const payload: TournamentActionPayload = {
          actionId: String(data.actionId ?? ""),
          userId: Number(data.userId),
          provider: String(data.provider || ""),
          actionCount: Number(data.actionCount),
          executedAtUTC: String(data.executedAtUTC || ""),
          sourceId: String(data.sourceId || ""),
          tournamentEligible: data.tournamentEligible !== false,
          metadata:
            data.metadata != null && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? (data.metadata as Record<string, unknown>)
              : null,
        };
        await onTournamentActionEvent(payload);
        return { ok: true };
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
