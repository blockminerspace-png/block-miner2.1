import crypto from "crypto";
import { v7 as uuidv7 } from "uuid";
import { getRequestIp } from "../../utils/clientIp.js";

const AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || "blockminer-audit-secret";
const SENSITIVE_KEYS = [
  "email",
  "cpf",
  "cnpj",
  "wallet",
  "walletaddress",
  "wallet_address",
  "privatekey",
  "private_key",
  "secret",
  "token",
  "password",
  "passphrase",
  "ssn"
];

function isSensitiveKey(key: string | undefined): boolean {
  if (!key) return false;
  const normalized = String(key).toLowerCase();
  return SENSITIVE_KEYS.some((pattern) => normalized.includes(pattern));
}

function maskString(value: string): string {
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function sanitizeNode(value: unknown, key: string | undefined): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return isSensitiveKey(key) ? maskString(value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNode(item, key));
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, childKey) => {
      acc[childKey] = sanitizeNode((value as Record<string, unknown>)[childKey], childKey);
      return acc;
    }, {});
  }
  return value;
}

export function sanitizeAuditPayload(payload: unknown): unknown {
  return sanitizeNode(payload, "");
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const o = value as Record<string, unknown>;
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(o[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function generateCorrelationId(): string {
  return uuidv7();
}

export function hashIp(ip: unknown): string {
  const normalized = String(ip || "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function buildAuditSignature(event: Record<string, unknown>): string {
  const normalized = {
    ...event,
    signature: undefined,
  };
  const canonical = stableStringify(normalized);
  return crypto.createHmac("sha256", AUDIT_HMAC_SECRET).update(canonical).digest("hex");
}

export function buildAuditContextFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
}): {
  correlationId: string;
  requestIp: string;
  ipHash: string;
  userAgent: string | null;
} {
  const requestIp = getRequestIp(req);
  return {
    correlationId: (req.headers["x-correlation-id"] as string) || generateCorrelationId(),
    requestIp,
    ipHash: hashIp(requestIp),
    userAgent: (req.headers["user-agent"] as string) || null,
  };
}

export function sha256Digest(data: string | Buffer): string {
  return crypto.createHash("sha256").update(String(data)).digest("hex");
}
