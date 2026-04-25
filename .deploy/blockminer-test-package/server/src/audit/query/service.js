import { auditLogListQuerySchema } from "./filters.js";
import { fetchAuditEvents, fetchAuditEventById } from "./repository.js";
import { sanitizeAuditPayload } from "../utils.js";

function buildAuditLogSummary(event) {
  return {
    id: event.id,
    correlationId: event.correlationId,
    userId: event.userId,
    eventType: event.eventType,
    status: event.status,
    severity: event.severity || null,
    resultCode: event.resultCode,
    createdAt: event.createdAt,
    txHash: event.txHash,
    ipHash: event.ipHash,
    source: event.source,
    summary: event.payload ? JSON.stringify(sanitizeAuditPayload(event.payload)) : null,
    chainHash: event.chainHash || null
  };
}

export async function listAuditLogs(rawQuery) {
  const query = auditLogListQuerySchema.parse(rawQuery || {});
  const result = await fetchAuditEvents({ query });
  return {
    items: result.items.map(buildAuditLogSummary),
    pageInfo: result.pageInfo
  };
}

export async function getAuditLogDetail(eventId) {
  const event = await fetchAuditEventById(eventId);
  if (!event) return null;
  return {
    ...event,
    payload: event.payload ? sanitizeAuditPayload(event.payload) : {},
    errorContext: event.errorContext ? sanitizeAuditPayload(event.errorContext) : null
  };
}
