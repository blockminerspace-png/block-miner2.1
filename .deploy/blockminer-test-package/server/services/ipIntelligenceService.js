import dns from "dns/promises";
import net from "net";
import { normalizeIp } from "../utils/clientIp.js";

const SUCCESS_TTL_DAYS = Number(process.env.IP_INTEL_SUCCESS_TTL_DAYS || 14);
const ERROR_TTL_HOURS = Number(process.env.IP_INTEL_ERROR_TTL_HOURS || 12);
const DNS_TIMEOUT_MS = Number(process.env.IP_INTEL_DNS_TIMEOUT_MS || 1200);

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

function timeoutPromise(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
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

export async function enrichIp(ipInput, deps = {}) {
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
    };
  }

  const [reverseDns, asnData] = await Promise.all([
    reverseDnsLookup(normalizedIp, deps.resolver),
    lookupAsn(normalizedIp, deps),
  ]);
  const reverseDnsForwardConfirmed = await forwardConfirm(normalizedIp, reverseDns, deps.resolver);
  const classification = classifyFromText([reverseDns, asnData.asnOrg].filter(Boolean).join(" "));
  return {
    ip: normalizedIp,
    ipVersion: net.isIP(normalizedIp),
    normalizedIp,
    reverseDns,
    reverseDnsForwardConfirmed,
    asn: asnData.asn ?? null,
    asnOrg: asnData.asnOrg ?? null,
    networkCidr: asnData.networkCidr ?? null,
    providerLabel: classification.providerLabel,
    providerType: classification.providerType,
    confidence: classification.confidence,
    source: asnData.source || "local-heuristic",
    error: asnData.error || null,
    checkedAt,
  };
}

function cacheToResult(row) {
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
    checkedAt: row.checkedAt,
    expiresAt: row.expiresAt,
  };
}

export async function getCachedIpIntelligence(prisma, ipInput, { forceRefresh = false, deps = {} } = {}) {
  const ip = normalizeIp(ipInput);
  if (!ip) return cacheToResult(null);
  const now = new Date();
  if (!forceRefresh && prisma?.ipIntelligenceCache) {
    const row = await prisma.ipIntelligenceCache.findUnique({ where: { ip } });
    if (row && row.expiresAt > now) return cacheToResult(row);
  }
  const result = await enrichIp(ip, deps);
  const ttlMs = result.error ? ERROR_TTL_HOURS * 60 * 60 * 1000 : SUCCESS_TTL_DAYS * 24 * 60 * 60 * 1000;
  const data = {
    ip,
    ipVersion: result.ipVersion || 0,
    reverseDns: result.reverseDns,
    reverseDnsForwardConfirmed: result.reverseDnsForwardConfirmed,
    asn: result.asn,
    asnOrg: result.asnOrg,
    networkCidr: result.networkCidr,
    providerLabel: result.providerLabel,
    providerType: result.providerType || "unknown",
    confidence: result.confidence || "low",
    source: result.source || "unknown",
    error: result.error,
    checkedAt: now,
    expiresAt: addMs(now, ttlMs),
  };
  if (prisma?.ipIntelligenceCache) {
    await prisma.ipIntelligenceCache.upsert({
      where: { ip },
      create: data,
      update: data,
    });
  }
  return { ...result, expiresAt: data.expiresAt };
}
