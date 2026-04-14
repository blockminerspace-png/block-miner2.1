import prisma from "./db.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AuditLogModel");

export async function createAuditLog({ userId, action, ip, userAgent, details }) {
  const detailsJson = details ? JSON.stringify(details) : null;

  return prisma.auditLog.create({
    data: {
      userId: userId || null,
      action,
      ip: ip || null,
      userAgent: userAgent || null,
      detailsJson,
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
