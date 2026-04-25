import prisma from "../../src/db/prisma.js";
import { computePassLevel, xpCapForSeason, xpRemainingToCap } from "./miniPassLevelMath.js";
import { pickMiniPassI18n } from "./miniPassI18n.js";
import { resolveMissionPeriodKey } from "./miniPassPeriod.js";
import { isMiniPassSeasonLive } from "./miniPassSeasonLive.js";

function mapRewardRow(r, langHeader) {
  return {
    id: r.id,
    level: r.level,
    rewardKind: r.rewardKind,
    title: pickMiniPassI18n(r.titleI18n, langHeader),
    minerId: r.minerId,
    eventMinerId: r.eventMinerId,
    hashRate: r.hashRate,
    hashRateDays: r.hashRateDays,
    blkAmount: r.blkAmount != null ? String(r.blkAmount) : null,
    polAmount: r.polAmount != null ? String(r.polAmount) : null
  };
}

function mapMissionRow(m, prog, langHeader) {
  const target = Number(m.targetValue);
  const current = prog ? Number(prog.currentValue) : 0;
  const done = Boolean(prog?.completedAt);
  return {
    id: m.id,
    cadence: m.cadence,
    missionType: m.missionType,
    targetValue: target,
    currentValue: current,
    completed: done,
    xpReward: m.xpReward,
    gameSlug: m.gameSlug,
    title: pickMiniPassI18n(m.titleI18n, langHeader),
    description: pickMiniPassI18n(m.descriptionI18n, langHeader)
  };
}

export async function listLiveMiniPassSeasons(langHeader) {
  const now = new Date();
  const rows = await prisma.miniPassSeason.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now }
    },
    orderBy: { id: "desc" }
  });

  return rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: pickMiniPassI18n(s.titleI18n, langHeader),
    subtitle: pickMiniPassI18n(s.subtitleI18n, langHeader),
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    bannerImageUrl: s.bannerImageUrl,
    maxLevel: s.maxLevel,
    xpPerLevel: s.xpPerLevel,
    buyLevelPricePol: String(s.buyLevelPricePol),
    completePassPricePol: String(s.completePassPricePol)
  }));
}

export async function getMiniPassSeasonDashboard(userId, seasonId, langHeader) {
  const now = new Date();
  const season = await prisma.miniPassSeason.findFirst({
    where: { id: seasonId, deletedAt: null, isActive: true },
    include: {
      levelRewards: { orderBy: { level: "asc" } },
      missions: { where: { isActive: true }, orderBy: { sortOrder: "asc" } }
    }
  });

  if (!season) return { ok: false, code: "not_found", status: 404 };
  if (!isMiniPassSeasonLive(season, now)) {
    return { ok: false, code: "season_not_live", status: 400 };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isBanned: true }
  });
  if (!user || user.isBanned) return { ok: false, code: "forbidden", status: 403 };

  await prisma.userMiniPassEnrollment.upsert({
    where: { userId_seasonId: { userId, seasonId } },
    create: { userId, seasonId, totalXp: 0 },
    update: {}
  });

  const [enr, claims] = await Promise.all([
    prisma.userMiniPassEnrollment.findUnique({
      where: { userId_seasonId: { userId, seasonId } }
    }),
    prisma.userMiniPassRewardClaim.findMany({
      where: { userId, levelReward: { seasonId } },
      select: { levelRewardId: true }
    })
  ]);

  const claimedSet = new Set(claims.map((c) => c.levelRewardId));
  const totalXp = Math.max(0, Math.floor(enr?.totalXp ?? 0));
  const xpPerLevel = Math.max(1, Math.floor(Number(season.xpPerLevel) || 1));
  const maxLevel = Math.max(1, Math.floor(Number(season.maxLevel) || 1));
  const level = computePassLevel(totalXp, xpPerLevel, maxLevel);
  const xpCap = xpCapForSeason(maxLevel, xpPerLevel);
  const xpIntoLevel = totalXp % xpPerLevel;
  const xpForNextLevel = level >= maxLevel ? 0 : xpPerLevel - xpIntoLevel;

  const periodKeys = [...new Set(season.missions.map((m) => resolveMissionPeriodKey(m.cadence, m.missionType, now)))];
  const progressRows = await prisma.userMiniPassMissionProgress.findMany({
    where: {
      userId,
      missionId: { in: season.missions.map((m) => m.id) },
      periodKey: { in: periodKeys }
    }
  });
  const progByMission = new Map(progressRows.map((p) => [`${p.missionId}|${p.periodKey}`, p]));

  const missions = season.missions.map((m) => {
    const pk = resolveMissionPeriodKey(m.cadence, m.missionType, now);
    const prog = progByMission.get(`${m.id}|${pk}`) || null;
    return mapMissionRow(m, prog, langHeader);
  });

  const rewards = season.levelRewards.map((r) => {
    const claimed = claimedSet.has(r.id);
    const unlocked = level >= r.level;
    return {
      ...mapRewardRow(r, langHeader),
      claimed,
      unlocked
    };
  });

  return {
    ok: true,
    season: {
      id: season.id,
      slug: season.slug,
      title: pickMiniPassI18n(season.titleI18n, langHeader),
      subtitle: pickMiniPassI18n(season.subtitleI18n, langHeader),
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      bannerImageUrl: season.bannerImageUrl,
      maxLevel,
      xpPerLevel,
      buyLevelPricePol: String(season.buyLevelPricePol),
      completePassPricePol: String(season.completePassPricePol)
    },
    progress: {
      totalXp,
      level,
      xpCap,
      xpIntoLevel,
      xpForNextLevel,
      xpRemainingToCap: xpRemainingToCap(totalXp, maxLevel, xpPerLevel)
    },
    missions,
    rewards
  };
}
