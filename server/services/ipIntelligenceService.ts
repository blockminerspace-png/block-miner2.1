import dns from "dns/promises";
import net from "net";
import type { IpIntelligenceCache, PrismaClient } from "@prisma/client";
import { deriveDefaultNetworkCidr, normalizeIp } from "../utils/clientIp.js";

const SUCCESS_TTL_DAYS = Number(process.env.IP_INTEL_SUCCESS_TTL_DAYS || 14);
const ERROR_TTL_HOURS = Number(process.env.IP_INTEL_ERROR_TTL_HOURS || 12);
const DNS_TIMEOUT_MS = Number(process.env.IP_INTEL_DNS_TIMEOUT_MS || 1200);
const PROXYCHECK_TTL_HOURS = Number(process.env.PROXYCHECK_TTL_HOURS || 24);
const PROXYCHECK_TIMEOUT_MS = Number(process.env.PROXYCHECK_TIMEOUT_MS || 1500);
const PROXYCHECK_DAILY_LIMIT = Number(process.env.PROXYCHECK_DAILY_LIMIT || 1000);

const HOSTING_TERMS = [
  "amazon", "aws", "google cloud", "google llc", "microsoft", "azure", "digitalocean", "hetzner",
  "ovh", "linode", "akamai", "vultr", "contabo", "hostinger", "hosting", "datacenter", "data center",
  "cloudflare", "oracle cloud", "leaseweb", "choopa", "servers", "server",
];
const MOBILE_TERMS = ["mobile", "wireless", "celular", "cellular", "cgnat", "cg-nat", "tim", "claro", "vivo", "telefonica", "telefônica"];
const RESIDENTIAL_TERMS = ["telecom", "broadband", "fibra", "fiber", "residential", "residencial", "net virtua", "oi", "gvt"];
const VPN_TERMS = ["vpn", "proxy", "tor-exit", "tor exit", "privacy", "anonym", "m247"];
const EDU_TERMS = ["university", "universidade", "college", "school", "educacao", "educação"];

function addMs(date, ms) {
  return new Date(date.getTime() + ms);
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function timeoutPromise(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

function sliceString(value, max = 255) {
  const s = String(value || "").trim();
  return s ? s.slice(0, max) : null;
}

function parseYesNo(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "yes" || normalized === "true") return true;
  if (normalized === "no" || normalized === "false") return false;
  return null;
}

function parseRiskScore(value) {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseUnixSeconds(value) {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const date = new Date(n * 1000);
  return Number.isFinite(date.getTime()) ? date : null;
}

function proxycheckEnabled() {
  const key = String(process.env.PROXYCHECK_API_KEY || "").trim();
  const enabled = String(process.env.PROXYCHECK_ENABLED || "true").trim().toLowerCase();
  return Boolean(key) && !["0", "false", "no", "off"].includes(enabled);
}

function classifyFromText(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return { providerType: "unknown", confidence: "low", providerLabel: null };
  if (VPN_TERMS.some((term) => value.includes(term))) {
    return { providerType: "vpn_proxy", confidence: "medium", providerLabel: "VPN/proxy" };
  }
  if (HOSTING_TERMS.some((term) => value.includes(term))) {
    return { providerType: "hosting", confidence: "medium", providerLabel: "Datacenter/hosting" };
  }
  if (EDU_TERMS.some((term) => value.includes(term))) {
    return { providerType: "education", confidence: "medium", providerLabel: "Education network" };
  }
  if (MOBILE_TERMS.some((term) => value.includes(term))) {
    return { providerType: "mobile", confidence: "medium", providerLabel: "Mobile/CGNAT carrier" };
  }
  if (RESIDENTIAL_TERMS.some((term) => value.includes(term))) {
    return { providerType: "residential", confidence: "medium", providerLabel: "Residential ISP" };
  }
  return { providerType: "unknown", confidence: "low", providerLabel: null };
}

async function reverseDnsLookup(ip, resolver = dns) {
  try {
    const names = await timeoutPromise(resolver.reverse(ip), DNS_TIMEOUT_MS);
    return Array.isArray(names) && names.length ? String(names[0]).slice(0, 253) : null;
  } catch {
    return null;
  }
}

async function forwardConfirm(ip, hostname, resolver = dns) {
  if (!hostname) return null;
  try {
    const records = await timeoutPromise(resolver.lookup(hostname, { all: true }), DNS_TIMEOUT_MS);
    return records.some((record) => normalizeIp(record.address) === ip);
  } catch {
    return false;
  }
}

function parseIpinfo(data) {
  if (!data || typeof data !== "object") return {};
  const asnMatch = String(data.org || "").match(/^AS(\d+)\s+(.+)$/i);
  return {
    asn: asnMatch ? Number(asnMatch[1]) : null,
    asnOrg: asnMatch ? asnMatch[2].trim().slice(0, 255) : String(data.org || "").slice(0, 255) || null,
    networkCidr: typeof data.network === "string" ? data.network.slice(0, 64) : null,
  };
}

type IpIntelCacheRowLike = Omit<IpIntelligenceCache, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<IpIntelligenceCache, "id" | "createdAt" | "updatedAt">>;

function cacheToResult(row: IpIntelligenceCache | IpIntelCacheRowLike | null) {
  if (!row) return null;
  return {
    ip: row.ip,
    ipVersion: row.ipVersion,
    normalizedIp: row.ip,
    reverseDns: row.reverseDns,
    reverseDnsForwardConfirmed: row.reverseDnsForwardConfirmed,
    asn: row.asn,
    asnOrg: row.asnOrg,
    networkCidr: row.networkCidr,
    providerLabel: row.providerLabel,
    providerType: row.providerType,
    confidence: row.confidence,
    source: row.source,
    error: row.error,
    proxyDetected: row.proxyDetected ?? null,
    proxyType: row.proxyType ?? null,
    proxyRiskScore: Number.isInteger(row.proxyRiskScore) ? row.proxyRiskScore : null,
    proxyProvider: row.proxyProvider ?? null,
    proxyLastSeenAt: row.proxyLastSeenAt ?? null,
    proxyCheckedAt: row.proxyCheckedAt ?? null,
    proxyExpiresAt: row.proxyExpiresAt ?? null,
    proxySource: row.proxySource ?? null,
    proxyError: row.proxyError ?? null,
    checkedAt: row.checkedAt,
    expiresAt: row.expiresAt,
  };
}

function pickProxyFields(source: Record<string, unknown> | null | undefined) {
  const s = source ?? {};
  return {
    proxyDetected: typeof s.proxyDetected === "boolean" ? s.proxyDetected : null,
    proxyType: s.proxyType ?? null,
    proxyRiskScore:
      typeof s.proxyRiskScore === "number" && Number.isInteger(s.proxyRiskScore) ? s.proxyRiskScore : null,
    proxyProvider: s.proxyProvider ?? null,
    proxyLastSeenAt: s.proxyLastSeenAt ?? null,
    proxyCheckedAt: s.proxyCheckedAt ?? null,
    proxyExpiresAt: s.proxyExpiresAt ?? null,
    proxySource: s.proxySource ?? null,
    proxyError: s.proxyError ?? null,
  };
}

async function withinProxycheckDailyBudget(prisma, row, now) {
  if (!proxycheckEnabled()) return false;
  if (!(PROXYCHECK_DAILY_LIMIT > 0)) return false;
  if (!prisma?.ipIntelligenceCache?.count) return true;
  const floor = startOfUtcDay(now);
  if (row?.proxyCheckedAt && row.proxyCheckedAt >= floor) return true;
  const usedToday = await prisma.ipIntelligenceCache.count({
    where: { proxyCheckedAt: { gte: floor } },
  }).catch(() => 0);
  return usedToday < PROXYCHECK_DAILY_LIMIT;
}

function extractProxycheckRecord(payload, ip) {
  if (!payload || typeof payload !== "object") return null;
  if (payload[ip] && typeof payload[ip] === "object") return payload[ip];
  const fallbackKey = Object.keys(payload).find((key) => key !== "status" && typeof payload[key] === "object");
  return fallbackKey ? payload[fallbackKey] : null;
}

export async function lookupAsn(ip, { fetchImpl = globalThis.fetch } = {}) {
  const provider = String(process.env.IP_ASN_PROVIDER || "none").toLowerCase();
  if (provider !== "ipinfo") return { source: "local-heuristic" };
  const token = String(process.env.IPINFO_TOKEN || "").trim();
  if (!token || typeof fetchImpl !== "function") return { source: "ipinfo", error: "provider_not_configured" };
  try {
    const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(Number(process.env.IP_INTEL_ASN_TIMEOUT_MS || 1500)) });
    if (!res.ok) return { source: "ipinfo", error: "provider_error" };
    return { ...parseIpinfo(await res.json()), source: "ipinfo" };
  } catch {
    return { source: "ipinfo", error: "provider_error" };
  }
}

export async function lookupProxycheck(ip, { fetchImpl = globalThis.fetch } = {}) {
  if (!proxycheckEnabled() || typeof fetchImpl !== "function") {
    return { source: "proxycheck_v2", error: "provider_not_configured" };
  }
  try {
    const key = encodeURIComponent(String(process.env.PROXYCHECK_API_KEY || "").trim());
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${key}&vpn=1&asn=1&risk=1&seen=1`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(PROXYCHECK_TIMEOUT_MS) });
    if (!res.ok) return { source: "proxycheck_v2", error: "provider_error" };
    const payload = await res.json();
    if (String(payload?.status || "").toLowerCase() !== "ok") {
      return { source: "proxycheck_v2", error: "provider_error" };
    }
    const record = extractProxycheckRecord(payload, ip);
    if (!record || typeof record !== "object") {
      return { source: "proxycheck_v2", error: "provider_error" };
    }
    return {
      source: "proxycheck_v2",
      proxyDetected: parseYesNo(record.proxy),
      proxyType: sliceString(record.type, 64),
      proxyRiskScore: parseRiskScore(record.risk),
      proxyProvider: sliceString(record.provider, 255),
      proxyLastSeenAt: parseUnixSeconds(record["last seen unix"]),
      error: null,
    };
  } catch {
    return { source: "proxycheck_v2", error: "provider_error" };
  }
}

export async function enrichIp(
  ipInput: string,
  deps: { resolver?: typeof dns; fetchImpl?: typeof fetch } = {}
) {
  const normalizedIp = normalizeIp(ipInput);
  const checkedAt = new Date();
  if (!normalizedIp) {
    return {
      ip: String(ipInput || ""),
      ipVersion: null,
      normalizedIp: null,
      reverseDns: null,
      reverseDnsForwardConfirmed: null,
      asn: null,
      asnOrg: null,
      networkCidr: null,
      providerLabel: null,
      providerType: "unknown",
      confidence: "low",
      source: "validation",
      error: "invalid_ip",
      checkedAt,
      proxyDetected: null,
      proxyType: null,
      proxyRiskScore: null,
      proxyProvider: null,
      proxyLastSeenAt: null,
      proxyCheckedAt: null,
      proxyExpiresAt: null,
      proxySource: null,
      proxyError: null,
    };
  }

  const [reverseDns, asnData] = await Promise.all([
    reverseDnsLookup(normalizedIp, deps.resolver),
    lookupAsn(normalizedIp, deps),
  ]);
  const reverseDnsForwardConfirmed = await forwardConfirm(normalizedIp, reverseDns, deps.resolver);
  const asnOrg = "asnOrg" in asnData ? (asnData.asnOrg ?? null) : null;
  const asn = "asn" in asnData ? (asnData.asn ?? null) : null;
  const rawCidr = "networkCidr" in asnData ? asnData.networkCidr : null;
  const networkCidr =
    typeof rawCidr === "string" && rawCidr.trim() !== "" ? rawCidr : deriveDefaultNetworkCidr(normalizedIp);
  const classification = classifyFromText([reverseDns, asnOrg].filter(Boolean).join(" "));
  return {
    ip: normalizedIp,
    ipVersion: net.isIP(normalizedIp),
    normalizedIp,
    reverseDns,
    reverseDnsForwardConfirmed,
    asn,
    asnOrg,
    networkCidr,
    providerLabel: classification.providerLabel,
    providerType: classification.providerType,
    confidence: classification.confidence,
    source: asnData.source || "local-heuristic",
    error: asnData.error || null,
    checkedAt,
    proxyDetected: null,
    proxyType: null,
    proxyRiskScore: null,
    proxyProvider: null,
    proxyLastSeenAt: null,
    proxyCheckedAt: null,
    proxyExpiresAt: null,
    proxySource: null,
    proxyError: null,
  };
}

export async function getCachedIpIntelligence(
  prisma: PrismaClient | null | undefined,
  ipInput: string,
  { forceRefresh = false, deps = {} }: { forceRefresh?: boolean; deps?: { resolver?: typeof dns; fetchImpl?: typeof fetch } } = {}
) {
  const ip = normalizeIp(ipInput);
  if (!ip) return cacheToResult(null);
  const now = new Date();
  const row = prisma?.ipIntelligenceCache?.findUnique
    ? await prisma.ipIntelligenceCache.findUnique({ where: { ip } }).catch(() => null)
    : null;

  const coreFresh = Boolean(row?.expiresAt && row.expiresAt > now);
  const proxyFresh = Boolean(row?.proxyExpiresAt && row.proxyExpiresAt > now);
  const needsCoreRefresh = forceRefresh || !row || !coreFresh;
  const needsProxyRefresh = proxycheckEnabled() && (!row || !proxyFresh);

  if (!needsCoreRefresh && !needsProxyRefresh) return cacheToResult(row);

  const baseResult = cacheToResult(row) || {
    ip,
    ipVersion: net.isIP(ip),
    normalizedIp: ip,
    reverseDns: null,
    reverseDnsForwardConfirmed: null,
    asn: null,
    asnOrg: null,
    networkCidr: deriveDefaultNetworkCidr(ip),
    providerLabel: null,
    providerType: "unknown",
    confidence: "low",
    source: "cache",
    error: null,
    checkedAt: now,
    expiresAt: now,
    proxyDetected: null,
    proxyType: null,
    proxyRiskScore: null,
    proxyProvider: null,
    proxyLastSeenAt: null,
    proxyCheckedAt: null,
    proxyExpiresAt: null,
    proxySource: null,
    proxyError: null,
  };

  let coreResult = baseResult;
  let coreCheckedAt = baseResult.checkedAt;
  let coreExpiresAt = baseResult.expiresAt;

  if (needsCoreRefresh) {
    const enriched = await enrichIp(ip, deps);
    const ttlMs = enriched.error ? ERROR_TTL_HOURS * 60 * 60 * 1000 : SUCCESS_TTL_DAYS * 24 * 60 * 60 * 1000;
    coreResult = {
      ...baseResult,
      ...enriched,
      normalizedIp: ip,
      ipVersion:
        typeof enriched.ipVersion === "number" && enriched.ipVersion > 0
          ? enriched.ipVersion
          : baseResult.ipVersion,
    };
    coreCheckedAt = now;
    coreExpiresAt = addMs(now, ttlMs);
  }

  let proxyResult = pickProxyFields(baseResult);
  if (needsProxyRefresh && await withinProxycheckDailyBudget(prisma, row, now)) {
    const lookedUp = await lookupProxycheck(ip, deps);
    proxyResult = {
      ...proxyResult,
      proxyCheckedAt: now,
      proxyExpiresAt: addMs(now, PROXYCHECK_TTL_HOURS * 60 * 60 * 1000),
      proxySource: sliceString(lookedUp.source, 64) || "proxycheck_v2",
      proxyError: sliceString(lookedUp.error, 64),
    };
    if (!lookedUp.error) {
      proxyResult.proxyDetected = typeof lookedUp.proxyDetected === "boolean" ? lookedUp.proxyDetected : null;
      proxyResult.proxyType = sliceString(lookedUp.proxyType, 64);
      proxyResult.proxyRiskScore =
        typeof lookedUp.proxyRiskScore === "number" && Number.isInteger(lookedUp.proxyRiskScore)
          ? lookedUp.proxyRiskScore
          : null;
      proxyResult.proxyProvider = sliceString(lookedUp.proxyProvider, 255);
      proxyResult.proxyLastSeenAt = lookedUp.proxyLastSeenAt ?? null;
    }
  }

  const data = {
    ip,
    ipVersion: coreResult.ipVersion || net.isIP(ip) || 0,
    reverseDns: coreResult.reverseDns ?? null,
    reverseDnsForwardConfirmed: coreResult.reverseDnsForwardConfirmed ?? null,
    asn: Number.isInteger(coreResult.asn) ? coreResult.asn : null,
    asnOrg: sliceString(coreResult.asnOrg, 255),
    networkCidr: sliceString(coreResult.networkCidr, 64) || deriveDefaultNetworkCidr(ip),
    providerLabel: sliceString(coreResult.providerLabel, 255),
    providerType: sliceString(coreResult.providerType, 64) || "unknown",
    confidence: sliceString(coreResult.confidence, 32) || "low",
    source: sliceString(coreResult.source, 64) || "unknown",
    error: sliceString(coreResult.error, 64),
    proxyDetected: typeof proxyResult.proxyDetected === "boolean" ? proxyResult.proxyDetected : null,
    proxyType: sliceString(proxyResult.proxyType, 64),
    proxyRiskScore: Number.isInteger(proxyResult.proxyRiskScore) ? proxyResult.proxyRiskScore : null,
    proxyProvider: sliceString(proxyResult.proxyProvider, 255),
    proxyLastSeenAt: proxyResult.proxyLastSeenAt instanceof Date ? proxyResult.proxyLastSeenAt : null,
    proxyCheckedAt: proxyResult.proxyCheckedAt instanceof Date ? proxyResult.proxyCheckedAt : null,
    proxyExpiresAt: proxyResult.proxyExpiresAt instanceof Date ? proxyResult.proxyExpiresAt : null,
    proxySource: sliceString(proxyResult.proxySource, 64),
    proxyError: sliceString(proxyResult.proxyError, 64),
    checkedAt: coreCheckedAt instanceof Date ? coreCheckedAt : now,
    expiresAt: coreExpiresAt instanceof Date ? coreExpiresAt : now,
  };

  if (prisma?.ipIntelligenceCache) {
    await prisma.ipIntelligenceCache.upsert({
      where: { ip },
      create: data,
      update: data,
    });
  }

  return cacheToResult(data);
}
