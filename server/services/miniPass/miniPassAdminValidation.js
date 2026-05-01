import { Prisma } from "../../src/db/prismaNamespace.js";
import {
  REWARD_BLK,
  REWARD_EVENT_MINER,
  REWARD_HASHRATE_TEMP,
  REWARD_NONE,
  REWARD_POL,
  REWARD_SHOP_MINER
} from "./miniPassConstants.js";

function positiveInt(n) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function normalizeDecimalInput(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.replace(",", ".");
}

function positiveDecimalString(s) {
  const normalized = normalizeDecimalInput(s);
  if (!normalized) return null;
  try {
    const d = new Prisma.Decimal(normalized);
    return d.gt(0) ? String(d) : null;
  } catch {
    return null;
  }
}

export function nonNegativeDecimalString(s) {
  const normalized = normalizeDecimalInput(s);
  if (!normalized) return null;
  try {
    const d = new Prisma.Decimal(normalized);
    return d.gte(0) ? String(d) : null;
  } catch {
    return null;
  }
}

/**
 * Ensures rewardKind-specific fields are present; returns a normalized payload for persistence.
 */
export function validateAndNormalizeLevelRewardInput({
  rewardKind,
  minerId,
  eventMinerId,
  hashRate,
  hashRateDays,
  blkAmount,
  polAmount
}) {
  const kind = String(rewardKind || REWARD_NONE).toUpperCase();
  const base = {
    rewardKind: kind,
    minerId: null,
    eventMinerId: null,
    hashRate: null,
    hashRateDays: null,
    blkAmount: null,
    polAmount: null
  };

  if (kind === REWARD_NONE) {
    return { ok: true, normalized: base };
  }

  if (kind === REWARD_SHOP_MINER) {
    const mid = positiveInt(minerId);
    if (!mid) return { ok: false, message: "SHOP_MINER requires a valid minerId." };
    return { ok: true, normalized: { ...base, minerId: mid } };
  }

  if (kind === REWARD_EVENT_MINER) {
    const eid = positiveInt(eventMinerId);
    if (!eid) return { ok: false, message: "EVENT_MINER requires a valid eventMinerId." };
    return { ok: true, normalized: { ...base, eventMinerId: eid } };
  }

  if (kind === REWARD_HASHRATE_TEMP) {
    const hr = Number(hashRate);
    const days = parseInt(hashRateDays, 10);
    if (!Number.isFinite(hr) || hr <= 0) {
      return { ok: false, message: "HASHRATE_TEMP requires hashRate > 0." };
    }
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return { ok: false, message: "HASHRATE_TEMP requires hashRateDays between 1 and 365." };
    }
    return { ok: true, normalized: { ...base, hashRate: hr, hashRateDays: days } };
  }

  if (kind === REWARD_BLK) {
    const amt = positiveDecimalString(blkAmount);
    if (!amt) return { ok: false, message: "BLK reward requires blkAmount > 0." };
    return { ok: true, normalized: { ...base, blkAmount: amt } };
  }

  if (kind === REWARD_POL) {
    const amt = positiveDecimalString(polAmount);
    if (!amt) return { ok: false, message: "POL reward requires polAmount > 0." };
    return { ok: true, normalized: { ...base, polAmount: amt } };
  }

  return { ok: false, message: "Unknown rewardKind." };
}

/**
 * Validates mission target and optional game slug filter.
 */
export function validateMissionInput({ missionType, targetValue, gameSlug, xpReward }) {
  const normalizedTarget = normalizeDecimalInput(targetValue);
  if (!normalizedTarget) {
    return { ok: false, message: "Invalid targetValue." };
  }
  let t;
  try {
    t = new Prisma.Decimal(normalizedTarget);
  } catch {
    return { ok: false, message: "Invalid targetValue." };
  }
  if (t.lte(0)) {
    return { ok: false, message: "targetValue must be greater than zero." };
  }

  const xp = Math.floor(Number(xpReward) || 0);
  if (!Number.isFinite(xp) || xp < 0 || xp > 1_000_000) {
    return { ok: false, message: "xpReward must be between 0 and 1000000." };
  }

  let slug = null;
  if (gameSlug != null && String(gameSlug).trim() !== "") {
    slug = String(gameSlug).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
      return { ok: false, message: "gameSlug must be lowercase alphanumeric with hyphens." };
    }
  }

  return { ok: true, targetDecimal: String(t), xpReward: xp, gameSlug: slug };
}

/**
 * Mini Pass titles: at least one of en / ptBR / es must be non-empty.
 * Missing locales are filled from the first available string for persistence and UI fallbacks.
 */
export function normalizeTitleI18nForMiniPass(obj) {
  if (!obj || typeof obj !== "object") return null;
  const en = typeof obj.en === "string" ? obj.en.trim() : "";
  const ptBR = typeof obj.ptBR === "string" ? obj.ptBR.trim() : "";
  const es = typeof obj.es === "string" ? obj.es.trim() : "";
  const primary = en || ptBR || es;
  if (!primary) return null;
  return {
    en: en || primary,
    ptBR: ptBR || primary,
    es: es || primary
  };
}

/**
 * Optional description blob: if present, require English non-empty for consistency with titles.
 */
export function normalizeDescriptionI18n(obj) {
  if (obj == null) return null;
  if (typeof obj !== "object") return null;
  const en = typeof obj.en === "string" ? obj.en.trim() : "";
  const ptBR = typeof obj.ptBR === "string" ? obj.ptBR.trim() : "";
  const es = typeof obj.es === "string" ? obj.es.trim() : "";
  if (!en && !ptBR && !es) return null;
  if (!en) return { error: "descriptionI18n.en is required when a description is provided." };
  return { value: { en, ptBR, es } };
}
