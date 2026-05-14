import net from "net";

const TRUSTED_HEADER_NAMES = {
  "cf-connecting-ip": "cf-connecting-ip",
  "x-real-ip": "x-real-ip",
  "x-forwarded-for": "x-forwarded-for",
  "fastly-client-ip": "fastly-client-ip",
  "true-client-ip": "true-client-ip",
};

function envBool(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || "").trim());
}

function stripIpv6Zone(value) {
  const pct = value.indexOf("%");
  return pct >= 0 ? value.slice(0, pct) : value;
}

export function normalizeIp(value) {
  if (value === null || value === undefined) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end > 0) raw = raw.slice(1, end);
  } else {
    const ipv4Port = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4Port) raw = ipv4Port[1];
  }
  raw = stripIpv6Zone(raw.replace(/^::ffff:/i, ""));
  const version = net.isIP(raw);
  if (!version) return null;
  return raw.toLowerCase();
}

function ipToBigInt(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  if (net.isIP(normalized) === 4) {
    return normalized.split(".").reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n);
  }
  const pieces = normalized.split("::");
  const head = pieces[0] ? pieces[0].split(":") : [];
  const tail = pieces[1] ? pieces[1].split(":") : [];
  const missing = Math.max(0, 8 - head.length - tail.length);
  const full = [...head, ...Array(missing).fill("0"), ...tail].map((x) => BigInt(parseInt(x || "0", 16)));
  if (full.length !== 8 || full.some((x) => x < 0n || x > 0xffffn)) return null;
  return full.reduce((acc, part) => (acc << 16n) + part, 0n);
}

function expandIpv6Hextets(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized || net.isIP(normalized) !== 6) return null;
  const pieces = normalized.split("::");
  const head = pieces[0] ? pieces[0].split(":") : [];
  const tail = pieces[1] ? pieces[1].split(":") : [];
  const missing = Math.max(0, 8 - head.length - tail.length);
  const full = [...head, ...Array(missing).fill("0"), ...tail];
  if (full.length !== 8) return null;
  return full.map((part) => {
    const value = Number.parseInt(part || "0", 16);
    return Number.isInteger(value) && value >= 0 && value <= 0xffff ? value : null;
  });
}

export function deriveDefaultNetworkCidr(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  if (net.isIP(normalized) !== 6) return null;
  const hextets = expandIpv6Hextets(normalized);
  if (!hextets || hextets.some((value) => value === null)) return null;
  const prefix = hextets
    .slice(0, 4)
    .map((value) => Number(value).toString(16))
    .join(":");
  return `${prefix}::/64`;
}

export function isIpInCidr(ip, cidr) {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp || typeof cidr !== "string") return false;
  const [rangeIpRaw, bitsRaw] = cidr.trim().split("/");
  const rangeIp = normalizeIp(rangeIpRaw);
  const version = net.isIP(normalizedIp);
  if (!rangeIp || version !== net.isIP(rangeIp)) return false;
  const maxBits = version === 4 ? 32 : 128;
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) return false;
  const ipNum = ipToBigInt(normalizedIp);
  const rangeNum = ipToBigInt(rangeIp);
  if (ipNum === null || rangeNum === null) return false;
  const shift = BigInt(maxBits - bits);
  return (ipNum >> shift) === (rangeNum >> shift);
}

function trustedProxyCidrs() {
  return String(process.env.TRUSTED_PROXY_CIDRS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isTrustedProxyAddress(remoteAddress) {
  const ip = normalizeIp(remoteAddress);
  if (!ip) return false;
  const cidrs = trustedProxyCidrs();
  if (cidrs.length === 0) {
    return ip === "127.0.0.1" || ip === "::1";
  }
  return cidrs.some((cidr) => isIpInCidr(ip, cidr));
}

function configuredHeaderPriority() {
  const configured = String(process.env.IP_HEADER_PRIORITY || "cf-connecting-ip,x-real-ip,x-forwarded-for")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.filter((name) => TRUSTED_HEADER_NAMES[name]);
}

function firstForwardedIp(value) {
  return String(value || "")
    .split(",")
    .map((s) => normalizeIp(s))
    .find(Boolean) || null;
}

export function getClientIp(req) {
  const remote = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress || req?.ip);
  const trustProxy = envBool("TRUST_PROXY");
  const mayTrustHeaders = trustProxy && isTrustedProxyAddress(remote);
  if (mayTrustHeaders) {
    for (const headerName of configuredHeaderPriority()) {
      const value = req?.headers?.[headerName];
      const candidate = headerName === "x-forwarded-for" ? firstForwardedIp(value) : normalizeIp(value);
      if (candidate) return candidate;
    }
  }
  return remote || "0.0.0.0";
}

export const getRequestIp = getClientIp;

export function getAnonymizedRequestIp(req) {
  const ip = getClientIp(req);
  if (!ip || ip === "::1" || ip === "127.0.0.1") return "127.0.0.x";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  return `${ip.slice(0, 16)}...`;
}
