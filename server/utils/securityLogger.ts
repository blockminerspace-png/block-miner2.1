/**
 * Structured fields for security-relevant events (searchable in log aggregation).
 */

import loggerLib from "./logger.js";

const base = loggerLib.child("Security");

/**
 * @param {string} eventType
 * @param {Record<string, unknown>} [fields]
 * @param {import("express").Request | null | undefined} [req]
 */
export function logSecurityEvent(eventType, fields = {}, req) {
  base.security(eventType, { eventType, ...fields }, req);
}

/**
 * @param {string} eventType
 * @param {Record<string, unknown>} [fields]
 * @param {import("express").Request | null | undefined} [req]
 */
export function logSecurityWarn(eventType, fields = {}, req) {
  base.warn(eventType, { eventType, ...fields }, req);
}
