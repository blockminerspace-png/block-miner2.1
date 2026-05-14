import { buildAuditContextFromRequest } from "./utils.js";

export function auditContextMiddleware(req, res, next) {
  if (!req.auditContext) {
    req.auditContext = buildAuditContextFromRequest(req);
  }
  if (!res.getHeader("X-Correlation-Id")) {
    res.setHeader("X-Correlation-Id", req.auditContext.correlationId);
  }
  next();
}
