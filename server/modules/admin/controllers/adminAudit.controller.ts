import type { Request, Response } from "express";
import { listAuditLogs, getAuditLogDetail } from "../../../src/audit/query/service.js";
import loggerLib from "../../../utils/logger.js";

const logger = loggerLib.child("AdminAuditController");

type AuditDetailParams = { id: string };

export async function listLogsHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await listAuditLogs(req.query);
    res.json({ ok: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("listLogsHandler failed", { error: msg, query: req.query });
    res.status(500).json({ ok: false, message: "Failed to list audit logs." });
  }
}

export async function getLogDetailHandler(req: Request<AuditDetailParams>, res: Response): Promise<void> {
  try {
    const event = await getAuditLogDetail(req.params.id);
    if (!event) {
      res.status(404).json({ ok: false, message: "Audit event not found." });
      return;
    }
    res.json({ ok: true, data: event });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("getLogDetailHandler failed", { error: msg, id: req.params.id });
    res.status(500).json({ ok: false, message: "Failed to retrieve audit event." });
  }
}
