import prisma from "../db/prisma.js";
import { AuditOutboxStatus, AUDIT_MAX_OUTBOX_BATCH } from "./constants.js";
import { fetchPendingAuditOutbox, updateAuditOutboxStatus, createAuditEventFromOutbox } from "./repository.js";
import { sha256Digest, stableStringify } from "./utils.js";
import { errMsg } from "../../types/tsNarrowing.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("worker");

async function computeChainHash(tx, outboxEntry) {
  const previous = await tx.auditEvent.findFirst({
    orderBy: { id: "desc" },
    select: { chainHash: true }
  });

  const payload = {
    correlationId: outboxEntry.correlationId,
    timestamp: outboxEntry.timestamp,
    eventType: outboxEntry.eventType,
    userId: outboxEntry.userId,
    anonymousId: outboxEntry.anonymousId,
    payload: outboxEntry.payload,
    resultCode: outboxEntry.resultCode,
    ipHash: outboxEntry.ipHash,
    txHash: outboxEntry.txHash,
    schemaVersion: outboxEntry.schemaVersion
  };

  const eventDigest = sha256Digest(stableStringify(payload));
  return sha256Digest(`${previous?.chainHash || ""}:${eventDigest}`);
}

export async function processAuditOutboxBatch({ client = prisma, limit = AUDIT_MAX_OUTBOX_BATCH } = {}) {
  const entries = await fetchPendingAuditOutbox({ client, limit });
  if (!entries.length) return { processed: 0 };

  let processed = 0;
  for (const outbox of entries) {
    try {
      await client.$transaction(async (tx) => {
        const chainHash = await computeChainHash(tx, outbox);
        await createAuditEventFromOutbox({ tx, outbox, chainHash });
        await updateAuditOutboxStatus({
          client: tx,
          id: outbox.id,
          status: AuditOutboxStatus.SENT,
          retryCount: outbox.retryCount,
          nextRetryAt: null,
          lastError: null
        });
      });
      processed += 1;
    } catch (error: unknown) {
      const nextRetryDelayMs = Math.min(60 * 60 * 1000, 1000 * 2 ** (outbox.retryCount || 0));
      const nextRetryAt = new Date(Date.now() + nextRetryDelayMs);
      const retryCount = (outbox.retryCount || 0) + 1;
      const status = retryCount >= 5 ? AuditOutboxStatus.DLQ : AuditOutboxStatus.FAILED;
      await updateAuditOutboxStatus({
        client,
        id: outbox.id,
        status,
        nextRetryAt: status === AuditOutboxStatus.DLQ ? null : nextRetryAt,
        lastError: errMsg(error),
        retryCount,
      });
    }
  }

  return { processed };
}

export function startAuditOutboxWorker({ client = prisma, intervalMs = 5000 } = {}) {
  const timer = setInterval(async () => {
    try {
      await processAuditOutboxBatch({ client, limit: AUDIT_MAX_OUTBOX_BATCH });
    } catch (error: unknown) {
      logger.error("Audit outbox worker error:", { error: String(errMsg(error)) });
    }
  }, intervalMs);

  process.once("beforeExit", () => clearInterval(timer));
  return timer;
}
