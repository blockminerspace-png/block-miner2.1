import { z } from "zod";

export const auditLogListQuerySchema = z.object({
  limit: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }, z.number().int().min(1).max(100).default(25)),
  cursor: z.string().optional(),
  direction: z.enum(["next", "prev"]).default("next"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  userId: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }, z.number().int().positive().optional()),
  eventType: z.string().trim().optional(),
  status: z.string().trim().optional(),
  severity: z.string().trim().optional(),
  ipHash: z.string().trim().optional(),
  correlationId: z.string().trim().optional(),
  txHash: z.string().trim().optional(),
  search: z.string().trim().optional(),
  includeDeleted: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    }
    return Boolean(value);
  }, z.boolean().optional())
});

export function buildAuditEventWhere(filters) {
  const where = {};

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }

  if (filters.userId) where.userId = filters.userId;
  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;
  if (filters.ipHash) where.ipHash = filters.ipHash;
  if (filters.correlationId) where.correlationId = filters.correlationId;
  if (filters.txHash) where.txHash = filters.txHash;

  if (filters.search) {
    const searchValue = filters.search;
    where.OR = [
      { correlationId: { contains: searchValue, mode: "insensitive" } },
      { txHash: { contains: searchValue, mode: "insensitive" } },
      { eventType: { contains: searchValue, mode: "insensitive" } },
      { resultCode: { contains: searchValue, mode: "insensitive" } }
    ];
  }

  return where;
}
