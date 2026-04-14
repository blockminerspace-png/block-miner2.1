import prisma from "../src/db/prisma.js";
import {
  CADENCE_DAILY,
  CADENCE_EVENT,
  CADENCE_WEEKLY,
  MISSION_LOGIN_DAY,
  MISSION_MINE_BLK,
  MISSION_PLAY_GAMES,
  REWARD_BLK,
  REWARD_EVENT_MINER,
  REWARD_HASHRATE_TEMP,
  REWARD_NONE,
  REWARD_POL,
  REWARD_SHOP_MINER
} from "../services/miniPass/miniPassConstants.js";
import {
  normalizeDescriptionI18n,
  normalizeTitleI18nForMiniPass,
  validateAndNormalizeLevelRewardInput,
  validateMissionInput
} from "../services/miniPass/miniPassAdminValidation.js";

const CADENCES = new Set([CADENCE_EVENT, CADENCE_DAILY, CADENCE_WEEKLY]);
const MISSION_TYPES = new Set([MISSION_PLAY_GAMES, MISSION_MINE_BLK, MISSION_LOGIN_DAY]);
const REWARD_KINDS = new Set([
  REWARD_NONE,
  REWARD_SHOP_MINER,
  REWARD_EVENT_MINER,
  REWARD_HASHRATE_TEMP,
  REWARD_BLK,
  REWARD_POL
]);

function parseSlug(s) {
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(v)) return null;
  return v;
}

export async function adminListMiniPassSeasons(req, res) {
  try {
    const rows = await prisma.miniPassSeason.findMany({
      where: { deletedAt: null },
      orderBy: { id: "desc" },
      include: {
        _count: { select: { levelRewards: true, missions: true } }
      }
    });
    res.json({ ok: true, seasons: rows });
  } catch (e) {
    console.error("adminListMiniPassSeasons", e);
    res.status(500).json({ ok: false, message: "Failed to list seasons." });
  }
}

export async function adminGetMiniPassSeason(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid id." });
    const row = await prisma.miniPassSeason.findFirst({
      where: { id, deletedAt: null },
      include: {
        levelRewards: { orderBy: { level: "asc" } },
        missions: { orderBy: { sortOrder: "asc" } }
      }
    });
    if (!row) return res.status(404).json({ ok: false, message: "Not found." });
    res.json({ ok: true, season: row });
  } catch (e) {
    console.error("adminGetMiniPassSeason", e);
    res.status(500).json({ ok: false, message: "Failed to load season." });
  }
}

export async function adminCreateMiniPassSeason(req, res) {
  try {
    const b = req.body || {};
    const slug = parseSlug(b.slug);
    if (!slug) return res.status(400).json({ ok: false, message: "Invalid slug." });
    const titleI18n = normalizeTitleI18nForMiniPass(b.titleI18n);
    if (!titleI18n) {
      return res.status(400).json({
        ok: false,
        message: "Title required in at least one language (en, pt-BR, or es)."
      });
    }

    const maxLevel = Math.max(1, Math.min(500, parseInt(b.maxLevel, 10) || 1));
    const xpPerLevel = Math.max(1, Math.min(1_000_000, parseInt(b.xpPerLevel, 10) || 1));
    const startsAt = b.startsAt ? new Date(b.startsAt) : null;
    const endsAt = b.endsAt ? new Date(b.endsAt) : null;
    if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ ok: false, message: "Invalid dates." });
    }
    if (endsAt <= startsAt) {
      return res.status(400).json({ ok: false, message: "endsAt must be after startsAt." });
    }

    const row = await prisma.miniPassSeason.create({
      data: {
        slug,
        titleI18n,
        subtitleI18n: b.subtitleI18n ?? null,
        startsAt,
        endsAt,
        maxLevel,
        xpPerLevel,
        buyLevelPricePol: String(b.buyLevelPricePol ?? "0"),
        completePassPricePol: String(b.completePassPricePol ?? "0"),
        bannerImageUrl: b.bannerImageUrl || null,
        isActive: Boolean(b.isActive !== false)
      }
    });
    res.json({ ok: true, season: row });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Slug already exists." });
    }
    console.error("adminCreateMiniPassSeason", e);
    res.status(500).json({ ok: false, message: "Failed to create season." });
  }
}

export async function adminUpdateMiniPassSeason(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid id." });
    const b = req.body || {};
    const data = {};

    if (b.slug !== undefined) {
      const slug = parseSlug(b.slug);
      if (!slug) return res.status(400).json({ ok: false, message: "Invalid slug." });
      data.slug = slug;
    }
    if (b.titleI18n !== undefined) {
      const normalized = normalizeTitleI18nForMiniPass(b.titleI18n);
      if (!normalized) {
        return res.status(400).json({
          ok: false,
          message: "Title required in at least one language (en, pt-BR, or es)."
        });
      }
      data.titleI18n = normalized;
    }
    if (b.subtitleI18n !== undefined) data.subtitleI18n = b.subtitleI18n;
    if (b.startsAt !== undefined) data.startsAt = new Date(b.startsAt);
    if (b.endsAt !== undefined) data.endsAt = new Date(b.endsAt);
    if (b.maxLevel !== undefined) data.maxLevel = Math.max(1, Math.min(500, parseInt(b.maxLevel, 10) || 1));
    if (b.xpPerLevel !== undefined) {
      data.xpPerLevel = Math.max(1, Math.min(1_000_000, parseInt(b.xpPerLevel, 10) || 1));
    }
    if (b.buyLevelPricePol !== undefined) data.buyLevelPricePol = String(b.buyLevelPricePol);
    if (b.completePassPricePol !== undefined) data.completePassPricePol = String(b.completePassPricePol);
    if (b.bannerImageUrl !== undefined) data.bannerImageUrl = b.bannerImageUrl || null;
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);

    const row = await prisma.miniPassSeason.updateMany({
      where: { id, deletedAt: null },
      data
    });
    if (row.count === 0) return res.status(404).json({ ok: false, message: "Not found." });
    const fresh = await prisma.miniPassSeason.findUnique({ where: { id } });
    res.json({ ok: true, season: fresh });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Slug already exists." });
    }
    console.error("adminUpdateMiniPassSeason", e);
    res.status(500).json({ ok: false, message: "Failed to update season." });
  }
}

export async function adminSoftDeleteMiniPassSeason(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid id." });
    await prisma.miniPassSeason.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("adminSoftDeleteMiniPassSeason", e);
    res.status(500).json({ ok: false, message: "Failed to delete season." });
  }
}

export async function adminUpsertLevelReward(req, res) {
  try {
    const seasonId = parseInt(req.params.seasonId, 10);
    const idRaw = req.params.rewardId;
    const id =
      idRaw !== undefined && idRaw !== "" && idRaw != null ? parseInt(String(idRaw), 10) : null;
    if (idRaw !== undefined && idRaw !== "" && (!id || id < 1)) {
      return res.status(400).json({ ok: false, message: "Invalid reward id." });
    }
    if (!seasonId) return res.status(400).json({ ok: false, message: "Invalid season." });

    const season = await prisma.miniPassSeason.findFirst({ where: { id: seasonId, deletedAt: null } });
    if (!season) return res.status(404).json({ ok: false, message: "Season not found." });

    const b = req.body || {};
    const level = Math.max(1, Math.min(500, parseInt(b.level, 10) || 1));
    if (level > season.maxLevel) {
      return res.status(400).json({ ok: false, message: "level exceeds season maxLevel." });
    }

    const rewardKind = String(b.rewardKind || "NONE").toUpperCase();
    if (!REWARD_KINDS.has(rewardKind)) {
      return res.status(400).json({ ok: false, message: "Invalid rewardKind." });
    }

    const checked = validateAndNormalizeLevelRewardInput({
      rewardKind,
      minerId: b.minerId,
      eventMinerId: b.eventMinerId,
      hashRate: b.hashRate,
      hashRateDays: b.hashRateDays,
      blkAmount: b.blkAmount,
      polAmount: b.polAmount
    });
    if (!checked.ok) {
      return res.status(400).json({ ok: false, message: checked.message });
    }

    const payload = {
      seasonId,
      level,
      ...checked.normalized,
      titleI18n: b.titleI18n ?? null,
      sortOrder: b.sortOrder != null ? parseInt(b.sortOrder, 10) : 0
    };

    let row;
    if (id) {
      const updated = await prisma.miniPassLevelReward.updateMany({
        where: { id, seasonId },
        data: payload
      });
      if (updated.count === 0) return res.status(404).json({ ok: false, message: "Reward not found." });
      row = await prisma.miniPassLevelReward.findUnique({ where: { id } });
    } else {
      row = await prisma.miniPassLevelReward.create({ data: payload });
    }
    res.json({ ok: true, reward: row });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Level reward already exists for this level." });
    }
    console.error("adminUpsertLevelReward", e);
    res.status(500).json({ ok: false, message: "Failed to save reward." });
  }
}

export async function adminDeleteLevelReward(req, res) {
  try {
    const seasonId = parseInt(req.params.seasonId, 10);
    const id = parseInt(req.params.rewardId, 10);
    await prisma.miniPassLevelReward.deleteMany({ where: { id, seasonId } });
    res.json({ ok: true });
  } catch (e) {
    console.error("adminDeleteLevelReward", e);
    res.status(500).json({ ok: false, message: "Failed to delete reward." });
  }
}

export async function adminUpsertMission(req, res) {
  try {
    const seasonId = parseInt(req.params.seasonId, 10);
    const idRaw = req.params.missionId;
    const id =
      idRaw !== undefined && idRaw !== "" && idRaw != null ? parseInt(String(idRaw), 10) : null;
    if (idRaw !== undefined && idRaw !== "" && (!id || id < 1)) {
      return res.status(400).json({ ok: false, message: "Invalid mission id." });
    }
    if (!seasonId) return res.status(400).json({ ok: false, message: "Invalid season." });

    const season = await prisma.miniPassSeason.findFirst({ where: { id: seasonId, deletedAt: null } });
    if (!season) return res.status(404).json({ ok: false, message: "Season not found." });

    const b = req.body || {};
    const cadence = String(b.cadence || "").toUpperCase();
    const missionType = String(b.missionType || "").toUpperCase();
    if (!CADENCES.has(cadence)) return res.status(400).json({ ok: false, message: "Invalid cadence." });
    if (!MISSION_TYPES.has(missionType)) {
      return res.status(400).json({ ok: false, message: "Invalid missionType." });
    }
    const missionTitle = normalizeTitleI18nForMiniPass(b.titleI18n);
    if (!missionTitle) {
      return res.status(400).json({
        ok: false,
        message: "Title required in at least one language (en, pt-BR, or es)."
      });
    }

    const mv = validateMissionInput({
      missionType,
      targetValue: b.targetValue,
      gameSlug: b.gameSlug,
      xpReward: b.xpReward
    });
    if (!mv.ok) {
      return res.status(400).json({ ok: false, message: mv.message });
    }

    const desc = normalizeDescriptionI18n(b.descriptionI18n);
    if (desc?.error) {
      return res.status(400).json({ ok: false, message: desc.error });
    }

    const payload = {
      seasonId,
      cadence,
      missionType,
      targetValue: mv.targetDecimal,
      xpReward: mv.xpReward,
      titleI18n: missionTitle,
      descriptionI18n: desc?.value ?? null,
      gameSlug: mv.gameSlug,
      isActive: b.isActive !== false,
      sortOrder: b.sortOrder != null ? parseInt(b.sortOrder, 10) : 0
    };

    let row;
    if (id) {
      const u = await prisma.miniPassMission.updateMany({
        where: { id, seasonId },
        data: payload
      });
      if (u.count === 0) return res.status(404).json({ ok: false, message: "Mission not found." });
      row = await prisma.miniPassMission.findUnique({ where: { id } });
    } else {
      row = await prisma.miniPassMission.create({ data: payload });
    }
    res.json({ ok: true, mission: row });
  } catch (e) {
    console.error("adminUpsertMission", e);
    res.status(500).json({ ok: false, message: "Failed to save mission." });
  }
}

export async function adminDeleteMission(req, res) {
  try {
    const seasonId = parseInt(req.params.seasonId, 10);
    const id = parseInt(req.params.missionId, 10);
    await prisma.miniPassMission.deleteMany({ where: { id, seasonId } });
    res.json({ ok: true });
  } catch (e) {
    console.error("adminDeleteMission", e);
    res.status(500).json({ ok: false, message: "Failed to delete mission." });
  }
}
