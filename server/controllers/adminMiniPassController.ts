import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import {
  CADENCE_DAILY,
  CADENCE_EVENT,
  CADENCE_WEEKLY,
  MISSION_AUTO_MINING_TURBO,
  MISSION_INTERNAL_OFFERWALL,
  MISSION_LOGIN_DAY,
  MISSION_MINE_BLK,
  MISSION_PLAY_GAMES,
  MISSION_WATCH_YOUTUBE,
  REWARD_BLK,
  REWARD_EVENT_MINER,
  REWARD_HASHRATE_TEMP,
  REWARD_NONE,
  REWARD_POL,
  REWARD_SHOP_MINER
} from "../services/miniPass/miniPassConstants.js";
import {
  normalizeDescriptionI18n,
  nonNegativeDecimalString,
  normalizeTitleI18nForMiniPass,
  validateAndNormalizeLevelRewardInput,
  validateMissionInput
} from "../services/miniPass/miniPassAdminValidation.js";
import { errMsg, paramStr, prismaErrCode } from "../types/tsNarrowing.js";

import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("adminMiniPassController");

const CADENCES = new Set([CADENCE_EVENT, CADENCE_DAILY, CADENCE_WEEKLY]);
const MISSION_TYPES = new Set([
  MISSION_PLAY_GAMES,
  MISSION_MINE_BLK,
  MISSION_LOGIN_DAY,
  MISSION_WATCH_YOUTUBE,
  MISSION_AUTO_MINING_TURBO,
  MISSION_INTERNAL_OFFERWALL
]);
const REWARD_KINDS = new Set([
  REWARD_NONE,
  REWARD_SHOP_MINER,
  REWARD_EVENT_MINER,
  REWARD_HASHRATE_TEMP,
  REWARD_BLK,
  REWARD_POL
]);

function parseSlug(s: unknown): string | null {
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(v)) return null;
  return v;
}

function bodyRecord(req: Request): Record<string, unknown> {
  const raw = req.body;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export async function adminListMiniPassSeasons(req: Request, res: Response) {
  try {
    const rows = await prisma.miniPassSeason.findMany({
      where: { deletedAt: null },
      orderBy: { id: "desc" },
      include: {
        _count: { select: { levelRewards: true, missions: true } }
      }
    });
    res.json({ ok: true, seasons: rows });
  } catch (e: unknown) {
    logger.error("adminListMiniPassSeasons", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to list seasons." });
  }
}

export async function adminGetMiniPassSeason(req: Request, res: Response) {
  try {
    const id = parseInt(paramStr(req.params["id"]), 10);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid id." });
    const row = await prisma.miniPassSeason.findFirst({
      where: { id, deletedAt: null },
      include: {
        levelRewards: {
          orderBy: { level: "asc" },
          include: {
            miner: { select: { id: true, name: true, isActive: true } },
            eventMiner: { select: { id: true, name: true, isActive: true } }
          }
        },
        missions: { orderBy: { sortOrder: "asc" } }
      }
    });
    if (!row) return res.status(404).json({ ok: false, message: "Not found." });
    res.json({ ok: true, season: row });
  } catch (e: unknown) {
    logger.error("adminGetMiniPassSeason", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to load season." });
  }
}

export async function adminCreateMiniPassSeason(req: Request, res: Response) {
  try {
    const b = bodyRecord(req);
    const slug = parseSlug(b["slug"]);
    if (!slug) return res.status(400).json({ ok: false, message: "Invalid slug." });
    const titleI18n = normalizeTitleI18nForMiniPass(b["titleI18n"]);
    if (!titleI18n) {
      return res.status(400).json({
        ok: false,
        message: "Title required in at least one language (en, pt-BR, or es)."
      });
    }

    const maxLevel = Math.max(1, Math.min(500, parseInt(String(b["maxLevel"]), 10) || 1));
    const xpPerLevel = Math.max(1, Math.min(1_000_000, parseInt(String(b["xpPerLevel"]), 10) || 1));
    const startsAt = b["startsAt"] ? new Date(String(b["startsAt"])) : null;
    const endsAt = b["endsAt"] ? new Date(String(b["endsAt"])) : null;
    if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ ok: false, message: "Invalid dates." });
    }
    if (endsAt <= startsAt) {
      return res.status(400).json({ ok: false, message: "endsAt must be after startsAt." });
    }
    const buyLevelPricePol = nonNegativeDecimalString(b["buyLevelPricePol"] ?? "0");
    if (buyLevelPricePol == null) {
      return res.status(400).json({ ok: false, message: "buyLevelPricePol must be a number >= 0." });
    }
    const completePassPricePol = nonNegativeDecimalString(b["completePassPricePol"] ?? "0");
    if (completePassPricePol == null) {
      return res.status(400).json({ ok: false, message: "completePassPricePol must be a number >= 0." });
    }

    const rawSub = b["subtitleI18n"];
    const subtitleI18n: Prisma.InputJsonValue | typeof Prisma.DbNull =
      rawSub === undefined || rawSub === null ? Prisma.DbNull : (rawSub as Prisma.InputJsonValue);

    const row = await prisma.miniPassSeason.create({
      data: {
        slug,
        titleI18n: titleI18n as Prisma.InputJsonValue,
        subtitleI18n,
        startsAt,
        endsAt,
        maxLevel,
        xpPerLevel,
        buyLevelPricePol,
        completePassPricePol,
        bannerImageUrl: (b["bannerImageUrl"] != null ? String(b["bannerImageUrl"]) : "") || null,
        isActive: Boolean(b["isActive"] !== false)
      }
    });
    res.json({ ok: true, season: row });
  } catch (e: unknown) {
    if (prismaErrCode(e) === "P2002") {
      return res.status(409).json({ ok: false, message: "Slug already exists." });
    }
    logger.error("adminCreateMiniPassSeason", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to create season." });
  }
}

export async function adminUpdateMiniPassSeason(req: Request, res: Response) {
  try {
    const id = parseInt(paramStr(req.params["id"]), 10);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid id." });
    const b = bodyRecord(req);
    const data: Prisma.MiniPassSeasonUpdateManyMutationInput = {};

    if (b["slug"] !== undefined) {
      const slug = parseSlug(b["slug"]);
      if (!slug) return res.status(400).json({ ok: false, message: "Invalid slug." });
      data.slug = slug;
    }
    if (b["titleI18n"] !== undefined) {
      const normalized = normalizeTitleI18nForMiniPass(b["titleI18n"]);
      if (!normalized) {
        return res.status(400).json({
          ok: false,
          message: "Title required in at least one language (en, pt-BR, or es)."
        });
      }
      data.titleI18n = normalized as Prisma.InputJsonValue;
    }
    if (b["subtitleI18n"] !== undefined) {
      const raw = b["subtitleI18n"];
      data.subtitleI18n =
        raw === null ? Prisma.DbNull : (raw as Prisma.InputJsonValue);
    }
    if (b["startsAt"] !== undefined) data.startsAt = new Date(String(b["startsAt"]));
    if (b["endsAt"] !== undefined) data.endsAt = new Date(String(b["endsAt"]));
    if (b["maxLevel"] !== undefined) {
      data.maxLevel = Math.max(1, Math.min(500, parseInt(String(b["maxLevel"]), 10) || 1));
    }
    if (b["xpPerLevel"] !== undefined) {
      data.xpPerLevel = Math.max(1, Math.min(1_000_000, parseInt(String(b["xpPerLevel"]), 10) || 1));
    }
    if (b["buyLevelPricePol"] !== undefined) {
      const normalized = nonNegativeDecimalString(b["buyLevelPricePol"]);
      if (normalized == null) {
        return res.status(400).json({ ok: false, message: "buyLevelPricePol must be a number >= 0." });
      }
      data.buyLevelPricePol = normalized;
    }
    if (b["completePassPricePol"] !== undefined) {
      const normalized = nonNegativeDecimalString(b["completePassPricePol"]);
      if (normalized == null) {
        return res.status(400).json({ ok: false, message: "completePassPricePol must be a number >= 0." });
      }
      data.completePassPricePol = normalized;
    }
    if (b["bannerImageUrl"] !== undefined) {
      data.bannerImageUrl = b["bannerImageUrl"] != null ? String(b["bannerImageUrl"]) : null;
    }
    if (b["isActive"] !== undefined) data.isActive = Boolean(b["isActive"]);

    const row = await prisma.miniPassSeason.updateMany({
      where: { id, deletedAt: null },
      data
    });
    if (row.count === 0) return res.status(404).json({ ok: false, message: "Not found." });
    const fresh = await prisma.miniPassSeason.findUnique({ where: { id } });
    res.json({ ok: true, season: fresh });
  } catch (e: unknown) {
    if (prismaErrCode(e) === "P2002") {
      return res.status(409).json({ ok: false, message: "Slug already exists." });
    }
    logger.error("adminUpdateMiniPassSeason", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to update season." });
  }
}

export async function adminSoftDeleteMiniPassSeason(req: Request, res: Response) {
  try {
    const id = parseInt(paramStr(req.params["id"]), 10);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid id." });
    await prisma.miniPassSeason.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false }
    });
    res.json({ ok: true });
  } catch (e: unknown) {
    logger.error("adminSoftDeleteMiniPassSeason", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to delete season." });
  }
}

export async function adminUpsertLevelReward(req: Request, res: Response) {
  try {
    const seasonId = parseInt(paramStr(req.params["seasonId"]), 10);
    const idRaw = req.params["rewardId"];
    const id =
      idRaw !== undefined && idRaw !== "" && idRaw != null ? parseInt(String(idRaw), 10) : null;
    if (idRaw !== undefined && idRaw !== "" && (!id || id < 1)) {
      return res.status(400).json({ ok: false, message: "Invalid reward id." });
    }
    if (!seasonId) return res.status(400).json({ ok: false, message: "Invalid season." });

    const season = await prisma.miniPassSeason.findFirst({ where: { id: seasonId, deletedAt: null } });
    if (!season) return res.status(404).json({ ok: false, message: "Season not found." });

    const b = bodyRecord(req);
    const level = Math.max(1, Math.min(500, parseInt(String(b["level"]), 10) || 1));
    if (level > season.maxLevel) {
      return res.status(400).json({ ok: false, message: "level exceeds season maxLevel." });
    }

    const rewardKind = String(b["rewardKind"] || "NONE").toUpperCase();
    if (!REWARD_KINDS.has(rewardKind)) {
      return res.status(400).json({ ok: false, message: "Invalid rewardKind." });
    }

    const checked = validateAndNormalizeLevelRewardInput({
      rewardKind,
      minerId: b["minerId"],
      eventMinerId: b["eventMinerId"],
      hashRate: b["hashRate"],
      hashRateDays: b["hashRateDays"],
      blkAmount: b["blkAmount"],
      polAmount: b["polAmount"]
    });
    if (!checked.ok) {
      return res.status(400).json({ ok: false, message: checked.message });
    }

    const norm = checked.normalized;

    if (rewardKind === REWARD_SHOP_MINER) {
      const mid = norm.minerId;
      if (mid == null) {
        return res.status(400).json({ ok: false, message: "Selected shop miner was not found or is inactive." });
      }
      const miner = await prisma.miner.findFirst({
        where: { id: mid, isActive: true },
        select: { id: true }
      });
      if (!miner) {
        return res.status(400).json({ ok: false, message: "Selected shop miner was not found or is inactive." });
      }
    }

    if (rewardKind === REWARD_EVENT_MINER) {
      const eid = norm.eventMinerId;
      if (eid == null) {
        return res.status(400).json({ ok: false, message: "Selected event miner was not found or is inactive." });
      }
      const eventMiner = await prisma.eventMiner.findFirst({
        where: {
          id: eid,
          isActive: true,
          event: { isActive: true, deletedAt: null }
        },
        select: { id: true }
      });
      if (!eventMiner) {
        return res.status(400).json({ ok: false, message: "Selected event miner was not found or is inactive." });
      }
    }

    const titleRaw = b["titleI18n"];
    const titleI18n: Prisma.InputJsonValue | typeof Prisma.DbNull =
      titleRaw === undefined || titleRaw === null ? Prisma.DbNull : (titleRaw as Prisma.InputJsonValue);
    const sortOrderRaw = b["sortOrder"];
    const sortOrder =
      sortOrderRaw != null ? parseInt(String(sortOrderRaw), 10) : 0;

    const createPayload: Prisma.MiniPassLevelRewardUncheckedCreateInput = {
      seasonId,
      level,
      rewardKind: norm.rewardKind,
      minerId: norm.minerId,
      eventMinerId: norm.eventMinerId,
      hashRate: norm.hashRate,
      hashRateDays: norm.hashRateDays,
      blkAmount: norm.blkAmount,
      polAmount: norm.polAmount,
      titleI18n,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0
    };

    let row;
    if (id) {
      const { seasonId: _sid, ...updatePayload } = createPayload;
      const updated = await prisma.miniPassLevelReward.updateMany({
        where: { id, seasonId },
        data: updatePayload
      });
      if (updated.count === 0) return res.status(404).json({ ok: false, message: "Reward not found." });
      row = await prisma.miniPassLevelReward.findUnique({ where: { id } });
    } else {
      row = await prisma.miniPassLevelReward.create({ data: createPayload });
    }
    res.json({ ok: true, reward: row });
  } catch (e: unknown) {
    if (prismaErrCode(e) === "P2002") {
      return res.status(409).json({ ok: false, message: "Level reward already exists for this level." });
    }
    logger.error("adminUpsertLevelReward", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to save reward." });
  }
}

export async function adminDeleteLevelReward(req: Request, res: Response) {
  try {
    const seasonId = parseInt(paramStr(req.params["seasonId"]), 10);
    const id = parseInt(paramStr(req.params["rewardId"]), 10);
    await prisma.miniPassLevelReward.deleteMany({ where: { id, seasonId } });
    res.json({ ok: true });
  } catch (e: unknown) {
    logger.error("adminDeleteLevelReward", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to delete reward." });
  }
}

export async function adminUpsertMission(req: Request, res: Response) {
  try {
    const seasonId = parseInt(paramStr(req.params["seasonId"]), 10);
    const idRaw = req.params["missionId"];
    const id =
      idRaw !== undefined && idRaw !== "" && idRaw != null ? parseInt(String(idRaw), 10) : null;
    if (idRaw !== undefined && idRaw !== "" && (!id || id < 1)) {
      return res.status(400).json({ ok: false, message: "Invalid mission id." });
    }
    if (!seasonId) return res.status(400).json({ ok: false, message: "Invalid season." });

    const season = await prisma.miniPassSeason.findFirst({ where: { id: seasonId, deletedAt: null } });
    if (!season) return res.status(404).json({ ok: false, message: "Season not found." });

    const b = bodyRecord(req);
    const cadence = String(b["cadence"] || "").toUpperCase();
    const missionType = String(b["missionType"] || "").toUpperCase();
    if (!CADENCES.has(cadence)) return res.status(400).json({ ok: false, message: "Invalid cadence." });
    if (!MISSION_TYPES.has(missionType)) {
      return res.status(400).json({ ok: false, message: "Invalid missionType." });
    }
    const missionTitle = normalizeTitleI18nForMiniPass(b["titleI18n"]);
    if (!missionTitle) {
      return res.status(400).json({
        ok: false,
        message: "Title required in at least one language (en, pt-BR, or es)."
      });
    }

    const mv = validateMissionInput({
      missionType,
      targetValue: b["targetValue"],
      gameSlug: b["gameSlug"],
      xpReward: b["xpReward"]
    });
    if (!mv.ok) {
      return res.status(400).json({ ok: false, message: mv.message });
    }

    const desc = normalizeDescriptionI18n(b["descriptionI18n"]);
    if (desc && "error" in desc) {
      return res.status(400).json({ ok: false, message: desc.error });
    }

    const descriptionI18n: Prisma.InputJsonValue | typeof Prisma.DbNull =
      desc && "value" in desc ? (desc.value as Prisma.InputJsonValue) : Prisma.DbNull;
    const sortOrderRaw = b["sortOrder"];
    const sortOrder =
      sortOrderRaw != null ? parseInt(String(sortOrderRaw), 10) : 0;

    const missionPayload: Prisma.MiniPassMissionUncheckedCreateInput = {
      seasonId,
      cadence,
      missionType,
      targetValue: mv.targetDecimal,
      xpReward: mv.xpReward,
      titleI18n: missionTitle as Prisma.InputJsonValue,
      descriptionI18n,
      gameSlug: mv.gameSlug,
      isActive: b["isActive"] !== false,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0
    };

    let row;
    if (id) {
      const { seasonId: _sid, ...missionUpdate } = missionPayload;
      const u = await prisma.miniPassMission.updateMany({
        where: { id, seasonId },
        data: missionUpdate
      });
      if (u.count === 0) return res.status(404).json({ ok: false, message: "Mission not found." });
      row = await prisma.miniPassMission.findUnique({ where: { id } });
    } else {
      row = await prisma.miniPassMission.create({ data: missionPayload });
    }
    res.json({ ok: true, mission: row });
  } catch (e: unknown) {
    logger.error("adminUpsertMission", { error: String(errMsg(e)) });
    res.status(500).json({ ok: false, message: "Failed to save mission." });
  }
}

export async function adminDeleteMission(req: Request, res: Response) {
  try {
    const seasonId = parseInt(paramStr(req.params["seasonId"]), 10);
    const id = parseInt(paramStr(req.params["missionId"]), 10);
    await prisma.miniPassMission.deleteMany({ where: { id, seasonId } });
    res.json({ ok: true });
  } catch (e: unknown) {
    logger.error("adminDeleteMission", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to delete mission." });
  }
}
