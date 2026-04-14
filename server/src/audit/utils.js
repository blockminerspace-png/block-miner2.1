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

function isSensitiveKey(key) {
  if (!key) return false;
  const normalized = String(key).toLowerCase();
  return SENSITIVE_KEYS.some((pattern) => normalized.includes(pattern));
}

function maskString(value) {
  if (typeof value !== "string") return value;
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function sanitizeNode(value, key) {
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
    return Object.keys(value).reduce((acc, childKey) => {
      acc[childKey] = sanitizeNode(value[childKey], childKey);
      return acc;
    }, {});
  }
  return value;
}

export function sanitizeAuditPayload(payload) {
  return sanitizeNode(payload);
}

export function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function generateCorrelationId() {
  return uuidv7();
}

export function hashIp(ip) {
  const normalized = String(ip || "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function buildAuditSignature(event) {
  const normalized = {
    ...event,
    signature: undefined
  };
  const canonical = stableStringify(normalized);
  return crypto.createHmac("sha256", AUDIT_HMAC_SECRET).update(canonical).digest("hex");
}

export function buildAuditContextFromRequest(req) {
  const requestIp = getRequestIp(req);
  return {
    correlationId: req.headers["x-correlation-id"] || generateCorrelationId(),
    requestIp,
    ipHash: hashIp(requestIp),
    userAgent: req.headers["user-agent"] || null
  };
}

export function sha256Digest(data) {
  return crypto.createHash("sha256").update(String(data)).digest("hex");
}
