import prisma from "../db/prisma.js";
import { unknownErrorMessage } from "../../utils/prismaHttpErrors.js";
import loggerLib from "../../utils/logger.js";
import { auditEventOutboxRecordSchema } from "./schemas.js";
import { buildAuditSignature, generateCorrelationId, hashIp, sanitizeAuditPayload } from "./utils.js";
import { AUDIT_DEFAULT_SOURCE, AUDIT_SCHEMA_VERSION } from "./constants.js";
import { createAuditEventOutbox } from "./repository.js";

const auditLogger = loggerLib.child("AuditService");

function buildEventRecord({
  correlationId,
  userId,
  anonymousId,
  timestamp,
  eventType,
  status,
  severity,
  resultCode,
  payload,
  ipHash,
  userAgent,
  txHash,
  errorContext,
  schemaVersion,
  source
}) {
  const event = {
    correlationId,
    userId: userId ?? null,
    anonymousId: anonymousId ?? null,
    eventType,
    status,
    severity: severity ?? null,
    resultCode,
    payload: sanitizeAuditPayload(payload ?? {}),
    timestamp,
    ipHash,
    userAgent: userAgent ?? null,
    txHash: txHash ?? null,
    errorContext: errorContext ?? null,
    schemaVersion: schemaVersion ?? AUDIT_SCHEMA_VERSION,
    source: source ?? AUDIT_DEFAULT_SOURCE
  };

  const signature = buildAuditSignature(event);
  return { ...event, signature };
}

export async function enqueueAuditEvent({ prismaOrTx, event }) {
  const client = prismaOrTx || prisma;
  const correlationId = event.correlationId || generateCorrelationId();
  const timestamp = event.timestamp || new Date().toISOString();
  const record = buildEventRecord({ ...event, correlationId, timestamp });

  const validated = auditEventOutboxRecordSchema.parse(record);
  return createAuditEventOutbox({ client, event: validated });
}

/** Audit must never block auth or purchases; failures are logged only. */
export async function enqueueAuditEventBestEffort(params: Parameters<typeof enqueueAuditEvent>[0]): Promise<void> {
  try {
    await enqueueAuditEvent(params);
  } catch (error: unknown) {
    const eventType =
      params?.event && typeof params.event === "object" && "eventType" in params.event
        ? String((params.event as { eventType?: unknown }).eventType ?? "")
        : "";
    auditLogger.warn("audit.enqueue_failed", {
      eventType: eventType || "unknown",
      message: unknownErrorMessage(error),
    });
  }
}

export function buildAuditEventFromHttpRequest({ req, event }) {
  return {
    correlationId: req.auditContext?.correlationId,
    userId: event.userId ?? null,
    anonymousId: event.anonymousId ?? req.auditContext?.ipHash ?? null,
    timestamp: new Date().toISOString(),
    eventType: event.eventType,
    status: event.status,
    severity: event.severity ?? null,
    resultCode: event.resultCode,
    payload: event.payload ?? {},
    ipHash: req.auditContext?.ipHash ?? hashIp(req.ip),
    userAgent: req.auditContext?.userAgent ?? req.headers["user-agent"] ?? null,
    txHash: event.txHash ?? null,
    errorContext: event.errorContext ?? null,
    source: event.source ?? "api"
  };
}
