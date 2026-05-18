import type { PrismaClient } from "@prisma/client";

/**
 * Shared aggregation of user hashrate from Prisma-loaded user rows (ranking, power stats).
 * Mirrors logic in minerProfileModel.syncUserBaseHashRate.
 */

/** Must match checkinMilestoneService CHECKIN_BONUS_GAME_SLUG */
export const CHECKIN_BONUS_GAME_SLUG = "checkin-streak-bonus";

/**
 * @param {object} user - Prisma user with miners, gamePowers (optional game), ytPowers, gpuAccess
 * @param {{ onlyActiveMiners?: boolean }} [opts]
 */
export function aggregateUserHashrates(user, opts: { onlyActiveMiners?: boolean } = {}) {
  const onlyActive = opts.onlyActiveMiners !== false;
  const miners = user.miners || [];
  const machineHr = miners
    .filter((m) => (onlyActive ? m.isActive !== false : true))
    .reduce((s, m) => s + (Number(m.hashRate) || 0), 0);

  const gameRows = user.gamePowers || [];
  let gameMinigameHr = 0;
  let gameCheckinHr = 0;
  for (const g of gameRows) {
    const slug = g.game?.slug || "";
    const hr = Number(g.hashRate) || 0;
    if (slug === CHECKIN_BONUS_GAME_SLUG) gameCheckinHr += hr;
    else gameMinigameHr += hr;
  }

  const ytHr = (user.ytPowers || []).reduce((s, y) => s + (Number(y.hashRate) || 0), 0);
  const legacyGpuHr = (user.gpuAccess || []).reduce((s, p) => s + (Number(p.gpuHashRate) || 0), 0);
  const v2GpuHr = (user.autoMiningV2Grants || []).reduce((s, g) => s + (Number(g.hashRate) || 0), 0);
  const gpuHr = legacyGpuHr + v2GpuHr;

  const temporaryHr = gameMinigameHr + gameCheckinHr + ytHr + gpuHr;
  const totalHr = machineHr + temporaryHr;

  return {
    permanentHashrate: machineHr,
    temporaryMinigameHashrate: gameMinigameHr,
    temporaryCheckinHashrate: gameCheckinHr,
    temporaryYoutubeHashrate: ytHr,
    temporaryAutoMiningHashrate: gpuHr,
    temporaryHashrate: temporaryHr,
    totalHashrate: totalHr
  };
}

/**
 * Prisma select/include shape for ranking-style queries.
 * @param {Date} now
 * @param {{ includeAutoMiningV2?: boolean }} [opts] — set false when v2 tables are not migrated
 */
export function rankingUserSelect(now, opts: { includeAutoMiningV2?: boolean } = {}) {
  const includeV2 = opts.includeAutoMiningV2 !== false;
  if (!includeV2) {
    return {
      id: true,
      username: true,
      name: true,
      isCreator: true,
      youtubeUrl: true,
      miners: {
        where: { isActive: true },
        select: { hashRate: true, isActive: true }
      },
      gamePowers: {
        where: { expiresAt: { gt: now } },
        select: {
          hashRate: true,
          game: { select: { slug: true, name: true } }
        }
      },
      ytPowers: {
        where: { expiresAt: { gt: now } },
        select: { hashRate: true }
      },
      gpuAccess: {
        where: { isClaimed: true, expiresAt: { gt: now } },
        select: { gpuHashRate: true }
      }
    };
  }
  return {
    id: true,
    username: true,
    name: true,
    isCreator: true,
    youtubeUrl: true,
    miners: {
      where: { isActive: true },
      select: { hashRate: true, isActive: true }
    },
    gamePowers: {
      where: { expiresAt: { gt: now } },
      select: {
        hashRate: true,
        game: { select: { slug: true, name: true } }
      }
    },
    ytPowers: {
      where: { expiresAt: { gt: now } },
      select: { hashRate: true }
    },
    gpuAccess: {
      where: { isClaimed: true, expiresAt: { gt: now } },
      select: { gpuHashRate: true }
    },
    autoMiningV2Grants: {
      where: { expiresAt: { gt: now } },
      select: { hashRate: true }
    }
  };
}

/**
 * Build leaderboard rows sorted by total hashrate descending.
 * @returns {{ id, username, name, isCreator, youtubeUrl, totalHashRate, baseHashRate, gameHashRate }[]}
 */
/** Cap ranking sample for heavy endpoints (e.g. GET /api/stats/power). */
export const POWER_STATS_RANKING_USER_CAP = 400;
export const POWER_STATS_RANKING_ACTIVE_MS = 7 * 86400000;

type RankingUserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  isCreator?: boolean | null;
  youtubeUrl?: string | null;
  miners?: Array<{ hashRate?: unknown; isActive?: boolean }>;
  gamePowers?: Array<{ hashRate?: unknown; game?: { slug?: string; name?: string } }>;
  ytPowers?: Array<{ hashRate?: unknown }>;
  gpuAccess?: Array<{ gpuHashRate?: unknown }>;
  autoMiningV2Grants?: Array<{ hashRate?: unknown }>;
};

export function mergeRankingSampleWithUser<T extends { id: number }>(
  sample: T[],
  self: T | null,
  userId: number,
): T[] {
  if (sample.some((u) => u.id === userId)) return sample;
  if (!self) return sample;
  return [...sample, self];
}

/**
 * Loads a bounded active-user sample for ranking instead of every non-banned user.
 */
export async function loadUsersForPowerStatsRanking(
  prismaClient: Pick<PrismaClient, "user">,
  userId: number,
  now: Date,
  v2SchemaOk: boolean,
): Promise<RankingUserRow[]> {
  const activeSince = new Date(now.getTime() - POWER_STATS_RANKING_ACTIVE_MS);
  const select = rankingUserSelect(now, { includeAutoMiningV2: v2SchemaOk });
  const sample = await prismaClient.user.findMany({
    where: {
      isBanned: false,
      OR: [{ lastHeartbeatAt: { gte: activeSince } }, { lastLoginAt: { gte: activeSince } }],
    },
    orderBy: [{ lastHeartbeatAt: "desc" }, { id: "asc" }],
    take: POWER_STATS_RANKING_USER_CAP,
    select,
  });
  if (sample.some((u) => u.id === userId)) return sample;
  const self = await prismaClient.user.findUnique({
    where: { id: userId },
    select,
  });
  return mergeRankingSampleWithUser(sample, self, userId);
}

export function buildRankingRows(users) {
  const rows = users.map((u) => {
    const agg = aggregateUserHashrates(u);
    return {
      id: u.id,
      username: u.username || "Miner",
      name: u.name,
      isCreator: u.isCreator,
      youtubeUrl: u.youtubeUrl,
      totalHashRate: agg.totalHashrate,
      baseHashRate: agg.permanentHashrate,
      /** All non-machine power (games, YouTube, Auto Mining, check-in bonuses) */
      gameHashRate: agg.temporaryHashrate
    };
  });
  rows.sort((a, b) => b.totalHashRate - a.totalHashRate);
  return rows;
}

/**
 * @returns {{ rank: number, totalUsers: number, totalHashrate: number } | null}
 */
export function computeUserRank(sortedRows, userId) {
  const idx = sortedRows.findIndex((r) => r.id === userId);
  if (idx < 0) return null;
  return {
    rank: idx + 1,
    totalUsers: sortedRows.length,
    totalHashrate: sortedRows[idx].totalHashRate
  };
}
