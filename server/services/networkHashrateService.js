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
export function aggregateUserHashrates(user, opts = {}) {
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

/** Prisma select/include shape for ranking-style queries */
export function rankingUserSelect(now) {
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
