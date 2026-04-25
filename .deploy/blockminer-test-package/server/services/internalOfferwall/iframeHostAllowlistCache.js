import { OFFER_KIND_GENERAL_TASK, OFFER_KIND_PTC_IFRAME } from "./internalOfferwallConstants.js";

/** Always merged into CSP + iframe validation (no .env). */
export const BUILTIN_IFRAME_HOSTS = [
  "zerads.com",
  "youtube.com",
  "youtube-nocookie.com",
  "blockminer.space"
];

/** @type {Set<string>} */
let cachedAllowlist = new Set(BUILTIN_IFRAME_HOSTS.map((h) => h.toLowerCase()));

/**
 * @returns {Set<string>}
 */
export function getIframeHostAllowlistCachedSync() {
  return cachedAllowlist;
}

/**
 * @param {string} host
 * @returns {{ ok: true, hostname: string } | { ok: false, message: string }}
 */
export function validateFrameHostnameForStorage(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h || h === "localhost") {
    return { ok: false, message: "Invalid iframe hostname." };
  }
  if (h.length > 253 || h.includes(":") || h.includes("[") || h.includes("]")) {
    return { ok: false, message: "Invalid iframe hostname." };
  }
  if (!/^[a-z0-9.-]+$/.test(h) || h.startsWith(".") || h.endsWith(".") || h.includes("..")) {
    return { ok: false, message: "Invalid iframe hostname." };
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    return { ok: false, message: "IP addresses are not allowed as iframe hosts." };
  }
  return { ok: true, hostname: h };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} host
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function upsertActiveFrameHost(prisma, host) {
  const vr = validateFrameHostnameForStorage(host);
  if (!vr.ok) {
    return { ok: false, message: vr.message };
  }
  await prisma.internalOfferwallFrameHost.upsert({
    where: { hostname: vr.hostname },
    create: { hostname: vr.hostname, isActive: true },
    update: { isActive: true }
  });
  return { ok: true };
}

/**
 * Rebuild allowlist: built-in hosts + active DB rows + hostnames from all PTC iframe URLs
 * and GENERAL_TASK externalInfoUrl values.
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function refreshIframeHostAllowlistCache(prisma) {
  const set = new Set(BUILTIN_IFRAME_HOSTS.map((h) => h.toLowerCase()));

  const rows = await prisma.internalOfferwallFrameHost.findMany({
    where: { isActive: true },
    select: { hostname: true }
  });
  for (const r of rows) {
    const h = String(r.hostname || "").trim().toLowerCase();
    if (h) set.add(h);
  }

  const ptcOffers = await prisma.internalOfferwallOffer.findMany({
    where: { kind: OFFER_KIND_PTC_IFRAME, iframeUrl: { not: null } },
    select: { iframeUrl: true }
  });
  for (const o of ptcOffers) {
    try {
      const u = new URL(String(o.iframeUrl));
      const h = u.hostname.toLowerCase();
      if (h && h !== "localhost") set.add(h);
    } catch {
      /* ignore bad stored URL */
    }
  }

  const genOffers = await prisma.internalOfferwallOffer.findMany({
    where: { kind: OFFER_KIND_GENERAL_TASK, taskMetadata: { not: null } },
    select: { taskMetadata: true }
  });
  for (const o of genOffers) {
    const meta = o.taskMetadata && typeof o.taskMetadata === "object" ? o.taskMetadata : null;
    const ext = meta && /** @type {Record<string, unknown>} */ (meta).externalInfoUrl;
    if (ext == null || !String(ext).trim()) continue;
    try {
      const u = new URL(String(ext));
      const h = u.hostname.toLowerCase();
      if (h && h !== "localhost") set.add(h);
    } catch {
      /* ignore */
    }
  }

  cachedAllowlist = set;
}
