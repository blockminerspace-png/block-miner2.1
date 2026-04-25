import prisma from "./db.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AuditLogModel");

function safeMetadata(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return details || null;
  const blocked = /password|hash|token|secret|cookie|authorization|private|mnemonic|seed|signature/i;
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => !blocked.test(String(key)))
  );
}

export async function createAuditLog({
  userId,
  action,
  ip,
  userAgent,
  details,
  label,
  description,
  source = "user",
  severity = "info",
  relatedEntityType,
  relatedEntityId,
  actorAdminId,
}) {
  const metadata = safeMetadata(details);
  const detailsJson = metadata ? JSON.stringify(metadata) : null;

  return prisma.auditLog.create({
    data: {
      userId: userId || null,
      action,
      label: label || null,
      description: description || null,
      source: source || "user",
      severity: severity || "info",
      ip: ip || null,
      userAgent: userAgent || null,
      detailsJson,
      metadata,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId != null ? String(relatedEntityId) : null,
      actorAdminId: actorAdminId || null,
      createdAt: new Date(),
    },
  });
}

/**
 * Persists a row in `audit_logs` for admin visibility. Never throws — failures are written to the app logger.
 * @returns {Promise<object | null>}
 */
export async function createAuditLogBestEffort(params) {
  try {
    return await createAuditLog(params);
  } catch (error) {
    logger.error("audit_log_persist_failed", {
      action: params?.action,
      message: error?.message || String(error),
    });
    return null;
  }
}
