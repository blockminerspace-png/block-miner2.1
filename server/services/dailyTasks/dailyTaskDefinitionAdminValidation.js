import { Prisma } from "../../src/db/prismaNamespace.js";
import {
  TASK_INTERNAL_OFFERWALL,
  TASK_LOGIN_DAY,
  TASK_MINE_BLK,
  TASK_PLAY_GAMES,
  TASK_WATCH_YOUTUBE
} from "./dailyTaskConstants.js";

export const ADMIN_CREATE_TASK_TYPES = [
  TASK_LOGIN_DAY,
  TASK_MINE_BLK,
  TASK_PLAY_GAMES,
  TASK_WATCH_YOUTUBE,
  TASK_INTERNAL_OFFERWALL
];

export const ADMIN_CREATE_REWARD_KINDS = ["BLK", "POL", "HASHRATE_TEMP", "SHOP_MINER", "EVENT_MINER"];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const I18N_KEY_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: object } | { ok: false, status: number, message: string }}
 */
export function parseCreateDailyTaskDefinition(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, message: "Invalid JSON body." };
  }
  const b = /** @type {Record<string, unknown>} */ (body);

  const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
  if (!slug || slug.length > 80 || !SLUG_RE.test(slug)) {
    return { ok: false, status: 400, message: "Invalid slug (lowercase letters, numbers, hyphens only)." };
  }

  const taskType = typeof b.taskType === "string" ? b.taskType.trim().toUpperCase() : "";
  if (!ADMIN_CREATE_TASK_TYPES.includes(taskType)) {
    return { ok: false, status: 400, message: "Invalid task type." };
  }

  const targetRaw = b.targetValue;
  const targetNum = typeof targetRaw === "number" ? targetRaw : parseFloat(String(targetRaw ?? ""));
  if (!Number.isFinite(targetNum) || targetNum <= 0 || targetNum > 1e15) {
    return { ok: false, status: 400, message: "Invalid target value (must be positive)." };
  }

  const translationKey = typeof b.translationKey === "string" ? b.translationKey.trim() : "";
  if (!translationKey || translationKey.length > 120 || !I18N_KEY_RE.test(translationKey)) {
    return { ok: false, status: 400, message: "Invalid translation key." };
  }

  const rewardKind = typeof b.rewardKind === "string" ? b.rewardKind.trim().toUpperCase() : "";
  if (!ADMIN_CREATE_REWARD_KINDS.includes(rewardKind)) {
    return { ok: false, status: 400, message: "Invalid reward kind." };
  }

  const autoSortOrder = b.autoSortOrder === true;
  let sortOrder = 0;
  if (!autoSortOrder) {
    if (b.sortOrder !== undefined && b.sortOrder !== null && String(b.sortOrder).trim() !== "") {
      sortOrder = parseInt(String(b.sortOrder), 10);
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 99999) {
        return { ok: false, status: 400, message: "Invalid sort order." };
      }
    }
  }

  const isActive = typeof b.isActive === "boolean" ? b.isActive : true;

  let gameSlug = null;
  if (b.gameSlug !== undefined && b.gameSlug !== null && String(b.gameSlug).trim() !== "") {
    const g = String(b.gameSlug).trim();
    if (g.length > 64 || !/^[a-z0-9_-]+$/i.test(g)) {
      return { ok: false, status: 400, message: "Invalid game slug." };
    }
    gameSlug = g;
  }

  if (taskType === TASK_INTERNAL_OFFERWALL && gameSlug) {
    return { ok: false, status: 400, message: "INTERNAL_OFFERWALL tasks cannot set gameSlug." };
  }

  let internalOfferwallOfferId = null;
  if (
    b.internalOfferwallOfferId !== undefined &&
    b.internalOfferwallOfferId !== null &&
    String(b.internalOfferwallOfferId).trim() !== ""
  ) {
    const oid = parseInt(String(b.internalOfferwallOfferId), 10);
    if (!Number.isInteger(oid) || oid < 1) {
      return { ok: false, status: 400, message: "Invalid internalOfferwallOfferId." };
    }
    internalOfferwallOfferId = oid;
  }

  const data = {
    slug,
    taskType,
    targetValue: new Prisma.Decimal(String(targetNum)),
    translationKey,
    rewardKind,
    rewardMinerId: null,
    rewardEventMinerId: null,
    rewardHashRate: null,
    rewardHashRateDays: null,
    rewardBlkAmount: null,
    rewardPolAmount: null,
    gameSlug,
    internalOfferwallOfferId,
    sortOrder,
    isActive
  };

  if (rewardKind === "BLK") {
    const a = parseFloat(String(b.rewardBlkAmount ?? ""));
    if (!Number.isFinite(a) || a <= 0 || a > 1e9) {
      return { ok: false, status: 400, message: "BLK reward requires a positive rewardBlkAmount." };
    }
    data.rewardBlkAmount = new Prisma.Decimal(String(a));
  } else if (rewardKind === "POL") {
    const a = parseFloat(String(b.rewardPolAmount ?? ""));
    if (!Number.isFinite(a) || a <= 0 || a > 1e9) {
      return { ok: false, status: 400, message: "POL reward requires a positive rewardPolAmount." };
    }
    data.rewardPolAmount = new Prisma.Decimal(String(a));
  } else if (rewardKind === "HASHRATE_TEMP") {
    const hr = parseFloat(String(b.rewardHashRate ?? ""));
    const days = parseInt(String(b.rewardHashRateDays ?? "1"), 10);
    if (!Number.isFinite(hr) || hr <= 0 || hr > 1e9) {
      return { ok: false, status: 400, message: "HASHRATE_TEMP requires a positive rewardHashRate." };
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return { ok: false, status: 400, message: "HASHRATE_TEMP requires rewardHashRateDays between 1 and 365." };
    }
    data.rewardHashRate = hr;
    data.rewardHashRateDays = days;
  } else if (rewardKind === "SHOP_MINER") {
    const mid = parseInt(String(b.rewardMinerId ?? ""), 10);
    if (!Number.isInteger(mid) || mid < 1) {
      return { ok: false, status: 400, message: "SHOP_MINER requires a valid rewardMinerId." };
    }
    data.rewardMinerId = mid;
  } else if (rewardKind === "EVENT_MINER") {
    const eid = parseInt(String(b.rewardEventMinerId ?? ""), 10);
    if (!Number.isInteger(eid) || eid < 1) {
      return { ok: false, status: 400, message: "EVENT_MINER requires a valid rewardEventMinerId." };
    }
    data.rewardEventMinerId = eid;
  }

  return { ok: true, data, autoSortOrder };
}
