import { z } from "zod";
import { AuditEventStatus, AuditEventType, AUDIT_SCHEMA_VERSION } from "./constants.js";

const auditEventTypeValues = Object.values(AuditEventType);
export const auditEventTypeSchema = z.enum(auditEventTypeValues);
export const auditEventStatusSchema = z.enum(Object.values(AuditEventStatus));

export const auditEventPayloadSchema = z.record(z.any()).default({});
export const auditErrorContextSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    details: z.record(z.any()).optional()
  })
  .nullable()
  .default(null);

export const auditEventInputSchema = z.object({
  correlationId: z.string().uuid(),
  userId: z.number().int().positive().optional().nullable(),
  anonymousId: z.string().optional().nullable(),
  timestamp: z.string().datetime(),
  eventType: auditEventTypeSchema,
  status: auditEventStatusSchema,
  resultCode: z.string().min(1),
  payload: auditEventPayloadSchema,
  ipHash: z.string().min(1),
  userAgent: z.string().nullable(),
  txHash: z.string().optional().nullable(),
  errorContext: auditErrorContextSchema,
  signature: z.string().min(1),
  schemaVersion: z.literal(AUDIT_SCHEMA_VERSION),
  source: z.string().min(1)
});

export const auditEventOutboxRecordSchema = auditEventInputSchema;
