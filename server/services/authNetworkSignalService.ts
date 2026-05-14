import crypto from "crypto";
import { deriveDefaultNetworkCidr, normalizeIp } from "../utils/clientIp.js";

const UNKNOWN_FINGERPRINT = "unknown";
const HIGH_RISK_PROVIDER_TYPES = new Set(["hosting", "vpn_proxy", "tor"]);

function mapCachedIpIntel(row, ip) {
  return {
    normalizedIp: ip,
    networkCidr: row?.networkCidr || deriveDefaultNetworkCidr(ip),
    asn: Number.isInteger(row?.asn) ? row.asn : null,
    providerType: String(row?.providerType || "unknown"),
  };
}

function decodeBase64Json(raw) {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(String(raw), "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeScreen(screen) {
  if (!screen || typeof screen !== "object") return null;
  const width = Number(screen.width || 0);
  const height = Number(screen.height || 0);
  const dpr = Number(screen.dpr || 0);
  const colorDepth = Number(screen.colorDepth || 0);
  if (!width || !height) return null;
  return {
    width,
    height,
    dpr: Number.isFinite(dpr) && dpr > 0 ? dpr : 1,
    colorDepth: Number.isFinite(colorDepth) && colorDepth > 0 ? colorDepth : null,
  };
}

function normalizeDeviceSignals(payload) {
  if (!payload || typeof payload !== "object") return null;
  const screen = normalizeScreen(payload.s);
  const timezone = typeof payload.tz === "string" ? payload.tz.trim().slice(0, 64) : null;
  const language = typeof payload.l === "string" ? payload.l.trim().slice(0, 32) : null;
  const platform = typeof payload.p === "string" ? payload.p.trim().slice(0, 64) : null;
  const hardwareConcurrency = Number(payload.hc || 0);
  const deviceMemory = Number(payload.dm || 0);
  const touchPoints = Number(payload.tp || 0);
  const bot = payload.b ? 1 : 0;

  const hasUsefulSignal =
    Boolean(screen) ||
    Boolean(timezone) ||
    Boolean(language) ||
    Boolean(platform) ||
    (Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0) ||
    (Number.isFinite(deviceMemory) && deviceMemory > 0) ||
    (Number.isFinite(touchPoints) && touchPoints > 0);
  if (!hasUsefulSignal) return null;

  return {
    screen,
    timezone,
    language,
    platform,
    hardwareConcurrency: Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : null,
    deviceMemory: Number.isFinite(deviceMemory) && deviceMemory > 0 ? deviceMemory : null,
    touchPoints: Number.isFinite(touchPoints) && touchPoints >= 0 ? touchPoints : null,
    bot,
    version: typeof payload.v === "string" ? payload.v.slice(0, 16) : null,
  };
}

export function extractSecurityPayload(req) {
  const headerPayload = decodeBase64Json(req?.headers?.["x-anti-bot-payload"]);
  if (headerPayload) return headerPayload;
  return decodeBase64Json(req?.body?.security?.fingerprint);
}

export function buildDeviceFingerprint(req) {
  const payload = extractSecurityPayload(req);
  const normalized = normalizeDeviceSignals(payload);
  if (!normalized) return UNKNOWN_FINGERPRINT;
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function getAuthIpContext(prisma, ipInput) {
  const ip = normalizeIp(ipInput);
  if (!ip) {
    return {
      normalizedIp: null,
      networkCidr: null,
      asn: null,
      providerType: "unknown",
    };
  }
  if (!prisma?.ipIntelligenceCache?.findUnique) return mapCachedIpIntel(null, ip);
  const row = await prisma.ipIntelligenceCache.findUnique({ where: { ip } }).catch(() => null);
  return mapCachedIpIntel(row, ip);
}

export async function recordUserIpLog(prismaOrTx, { userId, ip, networkCidr, asn, providerType, deviceFingerprint, userAgent, eventType, now = new Date() }) {
  const normalizedIp = normalizeIp(ip);
  if (!prismaOrTx?.userIpLog || !userId || !normalizedIp) return null;
  const fingerprint = String(deviceFingerprint || UNKNOWN_FINGERPRINT).slice(0, 128) || UNKNOWN_FINGERPRINT;
  const isRegister = eventType === "register";
  const isLogin = eventType === "login";
  return prismaOrTx.userIpLog.upsert({
    where: {
      userId_ip_deviceFingerprint: {
        userId: Number(userId),
        ip: normalizedIp,
        deviceFingerprint: fingerprint,
      },
    },
    create: {
      userId: Number(userId),
      ip: normalizedIp,
      deviceFingerprint: fingerprint,
      networkCidr: networkCidr || null,
      asn: Number.isInteger(asn) ? asn : null,
      providerType: String(providerType || "unknown"),
      firstSeen: now,
      lastSeen: now,
      loginCount: isLogin ? 1 : 0,
      registerCount: isRegister ? 1 : 0,
      lastUserAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    },
    update: {
      lastSeen: now,
      networkCidr: networkCidr || null,
      asn: Number.isInteger(asn) ? asn : null,
      providerType: String(providerType || "unknown"),
      lastUserAgent: userAgent ? String(userAgent).slice(0, 512) : null,
      ...(isLogin ? { loginCount: { increment: 1 } } : {}),
      ...(isRegister ? { registerCount: { increment: 1 } } : {}),
    },
  });
}

export async function evaluateRegistrationAttempt(prisma, { ip, networkCidr, providerType, deviceFingerprint, now = new Date() }) {
  if (!prisma?.userIpLog || !normalizeIp(ip)) {
    return { allowed: true, score: 0, reasons: [] };
  }

  const exactWindowStart = new Date(now.getTime() - 15 * 60 * 1000);
  const fingerprintWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const networkWindowStart = new Date(now.getTime() - 15 * 60 * 1000);

  const normalizedFingerprint = String(deviceFingerprint || UNKNOWN_FINGERPRINT);
  const [recentExactIp, recentFingerprint, recentNetwork] = await Promise.all([
    prisma.userIpLog.count({
      where: {
        ip: normalizeIp(ip),
        registerCount: { gt: 0 },
        lastSeen: { gte: exactWindowStart },
      },
    }),
    normalizedFingerprint !== UNKNOWN_FINGERPRINT
      ? prisma.userIpLog.count({
          where: {
            deviceFingerprint: normalizedFingerprint,
            registerCount: { gt: 0 },
            lastSeen: { gte: fingerprintWindowStart },
          },
        })
      : Promise.resolve(0),
    networkCidr
      ? prisma.userIpLog.count({
          where: {
            networkCidr,
            registerCount: { gt: 0 },
            lastSeen: { gte: networkWindowStart },
          },
        })
      : Promise.resolve(0),
  ]);

  const reasons: string[] = [];
  let score = 0;

  if (recentFingerprint >= 2) {
    score += 85;
    reasons.push("Same device fingerprint already created multiple recent accounts.");
  }

  if (HIGH_RISK_PROVIDER_TYPES.has(String(providerType || "unknown")) && recentExactIp >= 1) {
    score += 70;
    reasons.push("Hosting/VPN IP already used for a recent registration.");
  } else if (recentExactIp >= 4) {
    score += 65;
    reasons.push("Too many recent registrations from the same exact IP.");
  }

  if (networkCidr && recentNetwork >= 6) {
    score += 30;
    reasons.push("Too many recent registrations from the same IPv6 /64 network.");
  }

  return {
    allowed: score < 70,
    score: Math.min(100, score),
    reasons,
    cooldownMinutes: score >= 70 ? 15 : 0,
    providerType: String(providerType || "unknown"),
    recentExactIp,
    recentFingerprint,
    recentNetwork,
  };
}
