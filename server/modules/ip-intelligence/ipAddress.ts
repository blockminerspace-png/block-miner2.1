import net from "net";

export type ClientIpSource =
  | "cf-connecting-ip"
  | "x-real-ip"
  | "x-forwarded-for"
  | "socket"
  | "unknown";

export type ResolvedClientIp = {
  ip: string;
  source: ClientIpSource;
  remoteAddress: string | null;
  infrastructure: boolean;
  headersTrusted: boolean;
};

const TRUSTED_HEADER_NAMES: Record<string, ClientIpSource> = {
  "cf-connecting-ip": "cf-connecting-ip",
  "x-real-ip": "x-real-ip",
  "x-forwarded-for": "x-forwarded-for",
  "fastly-client-ip": "x-real-ip",
  "true-client-ip": "x-real-ip",
};

const DEFAULT_DOCKER_PROXY_CIDRS = [
  "127.0.0.1/32",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

function envBool(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? "").trim());
}

function stripIpv6Zone(value: string): string {
  const pct = value.indexOf("%");
  return pct >= 0 ? value.slice(0, pct) : value;
}

export function normalizeIp(value: unknown): string | null {
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

function ipToBigInt(ip: string): bigint | null {
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

export function isIpInCidr(ip: string, cidr: string): boolean {
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

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

function isPrivateOrLinkLocal(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    return (
      isIpInCidr(ip, "10.0.0.0/8") ||
      isIpInCidr(ip, "172.16.0.0/12") ||
      isIpInCidr(ip, "192.168.0.0/16") ||
      isIpInCidr(ip, "127.0.0.0/8") ||
      isIpInCidr(ip, "169.254.0.0/16")
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return false;
}

/** Docker bridge, loopback, LAN — never score as end-user fraud evidence alone. */
export function isInfrastructureIp(ipInput: unknown): boolean {
  const ip = normalizeIp(ipInput);
  if (!ip) return false;
  if (isLoopback(ip) || isPrivateOrLinkLocal(ip)) return true;
  const extra = String(process.env.IP_INFRASTRUCTURE_CIDRS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.some((cidr) => isIpInCidr(ip, cidr));
}

function defaultTrustedProxyCidrs(): string[] {
  const configured = String(process.env.TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  if (!envBool("TRUST_PROXY")) return ["127.0.0.1/32", "::1/128"];
  return DEFAULT_DOCKER_PROXY_CIDRS;
}

export function isTrustedProxyAddress(remoteAddress: unknown): boolean {
  const ip = normalizeIp(remoteAddress);
  if (!ip) return false;
  return defaultTrustedProxyCidrs().some((cidr) => isIpInCidr(ip, cidr));
}

function configuredHeaderPriority(): ClientIpSource[] {
  const configured = String(
    process.env.IP_HEADER_PRIORITY ?? "cf-connecting-ip,x-real-ip,x-forwarded-for",
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.filter((name): name is ClientIpSource => name in TRUSTED_HEADER_NAMES);
}

function firstPublicIpFromForwarded(value: unknown): string | null {
  for (const part of String(value ?? "").split(",")) {
    const candidate = normalizeIp(part);
    if (candidate && !isInfrastructureIp(candidate)) return candidate;
  }
  return null;
}

function readHeaderIp(
  req: { headers?: Record<string, unknown> },
  headerName: ClientIpSource,
): string | null {
  const raw = req.headers?.[headerName];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (headerName === "x-forwarded-for") return firstPublicIpFromForwarded(value);
  const candidate = normalizeIp(value);
  if (!candidate || isInfrastructureIp(candidate)) return null;
  return candidate;
}

export function resolveClientIp(req: {
  headers?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
  ip?: string;
}): ResolvedClientIp {
  const remote = normalizeIp(req?.socket?.remoteAddress ?? req?.connection?.remoteAddress ?? req?.ip);
  const trustProxy = envBool("TRUST_PROXY");
  const trustCloudflare = envBool("TRUST_CLOUDFLARE");
  const remoteIsInfra = Boolean(remote && isInfrastructureIp(remote));
  const headersTrusted =
    trustProxy && Boolean(remote && (isTrustedProxyAddress(remote) || remoteIsInfra));

  if (headersTrusted) {
    const order = configuredHeaderPriority();
    if (trustCloudflare) {
      const cf = readHeaderIp(req, "cf-connecting-ip");
      if (cf) {
        return { ip: cf, source: "cf-connecting-ip", remoteAddress: remote, infrastructure: false, headersTrusted: true };
      }
    }
    for (const headerName of order) {
      if (headerName === "cf-connecting-ip" && !trustCloudflare) continue;
      const candidate = readHeaderIp(req, headerName);
      if (candidate) {
        return { ip: candidate, source: headerName, remoteAddress: remote, infrastructure: false, headersTrusted: true };
      }
    }
  }

  const fallback = remote && !isInfrastructureIp(remote) ? remote : null;
  return {
    ip: fallback || remote || "0.0.0.0",
    source: "socket",
    remoteAddress: remote,
    infrastructure: Boolean(fallback ? false : remoteIsInfra || !fallback),
    headersTrusted,
  };
}

export function getClientIp(req: Parameters<typeof resolveClientIp>[0]): string {
  const resolved = resolveClientIp(req);
  if (resolved.infrastructure && resolved.remoteAddress) {
    return resolved.remoteAddress;
  }
  return resolved.ip;
}

export function deriveDefaultNetworkCidr(ip: string): string | null {
  const normalized = normalizeIp(ip);
  if (!normalized || net.isIP(normalized) !== 6 || isInfrastructureIp(normalized)) return null;
  const pieces = normalized.split("::");
  const head = pieces[0] ? pieces[0].split(":") : [];
  const tail = pieces[1] ? pieces[1].split(":") : [];
  const missing = Math.max(0, 8 - head.length - tail.length);
  const full = [...head, ...Array(missing).fill("0"), ...tail].map((part) => Number.parseInt(part || "0", 16));
  if (full.length !== 8 || full.some((v) => !Number.isInteger(v) || v < 0 || v > 0xffff)) return null;
  const prefix = full
    .slice(0, 4)
    .map((value) => value.toString(16))
    .join(":");
  return `${prefix}::/64`;
}
