import { listAuditLogs, getAuditLogDetail } from "../src/audit/query/service.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AdminAuditController");

export async function listLogsHandler(req, res) {
  try {
    const result = await listAuditLogs(req.query);
    return res.json({ ok: true, ...result });
  } catch (error) {
    logger.error("listLogsHandler failed", { error: error.message, query: req.query });
    return res.status(500).json({ ok: false, message: "Failed to list audit logs." });
  }
}

export async function getLogDetailHandler(req, res) {
  try {
    const event = await getAuditLogDetail(req.params.id);
    if (!event) return res.status(404).json({ ok: false, message: "Audit event not found." });
    return res.json({ ok: true, data: event });
  } catch (error) {
    logger.error("getLogDetailHandler failed", { error: error.message, id: req.params.id });
    return res.status(500).json({ ok: false, message: "Failed to retrieve audit event." });
  }
}
