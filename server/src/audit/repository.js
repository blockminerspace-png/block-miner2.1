export async function createAuditEventOutbox({ client, event }) {
  return client.auditEventOutbox.create({ data: event });
}

/**
 * Rows ready to be promoted to `audit_events`.
 * New outbox rows store the *event* status (SUCCESS / FAILED / PARTIAL), not a separate queue flag.
 * Completed rows use `SENT`; exhausted retries use `DLQ`.
 */
export async function fetchPendingAuditOutbox({ client, limit = 25 }) {
  return client.auditEventOutbox.findMany({
    where: {
      status: { notIn: ["SENT", "DLQ"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function updateAuditOutboxStatus({ client, id, status, nextRetryAt = null, lastError = null, retryCount }) {
  return client.auditEventOutbox.update({
    where: { id },
    data: {
      status,
      nextRetryAt,
      lastError,
      retryCount
    }
  });
}

export async function createAuditEventFromOutbox({ tx, outbox, chainHash }) {
  return tx.auditEvent.create({
    data: {
      correlationId: outbox.correlationId,
      userId: outbox.userId,
      anonymousId: outbox.anonymousId,
      eventType: outbox.eventType,
      status: outbox.status,
      severity: outbox.severity ?? null,
      resultCode: outbox.resultCode,
      payload: outbox.payload,
      timestamp: outbox.timestamp,
      ipHash: outbox.ipHash,
      userAgent: outbox.userAgent,
      txHash: outbox.txHash,
      errorContext: outbox.errorContext,
      signature: outbox.signature,
      schemaVersion: outbox.schemaVersion,
      source: outbox.source,
      chainHash
    }
  });
}
