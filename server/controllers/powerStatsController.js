import prisma from "../src/db/prisma.js";
import { getBlkCyclePublicSnapshot } from "../services/blkRewardDistributionService.js";
import { computeCheckinStreak } from "../utils/checkinStreak.js";
import {
  CHECKIN_BONUS_GAME_SLUG,
  aggregateUserHashrates,
  buildRankingRows,
  computeUserRank,
  rankingUserSelect
} from "../services/networkHashrateService.js";

const HISTORY_LOG_DAYS = 30;
const BLK_CYCLE_HISTORY = 20;
const YT_HISTORY_LIMIT = 20;

function iso(d) {
  return d && d.toISOString ? d.toISOString() : null;
}

function utcDateKey(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/stats/power
 * Read-only consolidated power breakdown for the authenticated user + network context.
 */
export async function getPowerStats(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();

    const [
      userRow,
      allMiners,
      gamePowers,
      ytPowers,
      gpuPowers,
      ytHistory,
      miningLogs,
      blkCycles,
      streak,
      allRankUsers,
      activeUsers24h
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          miningPayoutMode: true,
          lastHeartbeatAt: true,
          lastLoginAt: true
        }
      }),
      prisma.userMiner.findMany({
        where: { userId },
        include: {
          miner: { select: { name: true, slug: true, imageUrl: true } },
          userRack: {
            include: {
              room: { select: { id: true, roomNumber: true } }
            }
          }
        },
        orderBy: { slotIndex: "asc" }
      }),
      prisma.userPowerGame.findMany({
        where: { userId, expiresAt: { gt: now } },
        include: { game: { select: { id: true, name: true, slug: true } } },
        orderBy: { expiresAt: "asc" }
      }),
      prisma.youtubeWatchPower.findMany({
        where: { userId, expiresAt: { gt: now } },
        orderBy: { expiresAt: "asc" }
      }),
      prisma.autoMiningGpu.findMany({
        where: { userId, isClaimed: true, expiresAt: { gt: now } },
        orderBy: { expiresAt: "asc" }
      }),
      prisma.youtubeWatchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: YT_HISTORY_LIMIT,
        select: {
          id: true,
          hashRate: true,
          claimedAt: true,
          expiresAt: true,
          sourceVideoId: true,
          status: true,
          createdAt: true
        }
      }),
      prisma.miningRewardsLog.findMany({
        where: {
          userId,
          createdAt: { gte: new Date(Date.now() - HISTORY_LOG_DAYS * 86400000) }
        },
        select: {
          createdAt: true,
          sharePercentage: true,
          workAccumulated: true,
          blockNumber: true
        },
        orderBy: { createdAt: "asc" }
      }),
      prisma.blkRewardCycle.findMany({
        orderBy: { windowStart: "desc" },
        take: BLK_CYCLE_HISTORY,
        select: {
          windowStart: true,
          totalHashrate: true,
          minerCount: true
        }
      }),
      computeCheckinStreak(userId),
      prisma.user.findMany({
        where: { isBanned: false },
        select: rankingUserSelect(now)
      }),
      prisma.user.count({
        where: {
          isBanned: false,
          OR: [
            { lastHeartbeatAt: { gte: new Date(Date.now() - 86400000) } },
            { lastLoginAt: { gte: new Date(Date.now() - 86400000) } }
          ]
        }
      })
    ]);

    const gpuV2Powers = await prisma.autoMiningV2PowerGrant.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
      select: {
        id: true,
        hashRate: true,
        earnedAt: true,
        expiresAt: true,
        mode: true
      }
    });

    if (!userRow) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    let checkinHashMilestones = [];
    try {
      checkinHashMilestones = await prisma.checkinStreakMilestone.findMany({
        where: { active: true, rewardType: "hashrate" },
        orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
        select: {
          dayThreshold: true,
          rewardValue: true,
          validityDays: true,
          displayTitle: true
        }
      });
    } catch (e) {
      console.warn("getPowerStats: checkin milestones unavailable", e?.message);
    }

    const agg = aggregateUserHashrates(
      {
        miners: allMiners.filter((m) => m.isActive),
        gamePowers,
        ytPowers,
        gpuAccess: gpuPowers,
        autoMiningV2Grants: gpuV2Powers
      },
      { onlyActiveMiners: true }
    );

    const total = agg.totalHashrate || 0;
    const permPct = total > 0 ? (agg.permanentHashrate / total) * 100 : 0;
    const tempPct = total > 0 ? (agg.temporaryHashrate / total) * 100 : 0;

    const expirations = [];

    for (const g of gamePowers) {
      expirations.push({
        source: "game",
        slug: g.game?.slug || "unknown",
        name: g.game?.name || "Game",
        hashRate: Number(g.hashRate) || 0,
        expiresAt: iso(g.expiresAt),
        playedAt: iso(g.playedAt)
      });
    }
    for (const y of ytPowers) {
      expirations.push({
        source: "youtube",
        slug: null,
        name: "YouTube",
        hashRate: Number(y.hashRate) || 0,
        expiresAt: iso(y.expiresAt),
        playedAt: iso(y.claimedAt)
      });
    }
    for (const p of gpuPowers) {
      expirations.push({
        source: "auto_mining",
        slug: null,
        name: "Auto Mining GPU",
        hashRate: Number(p.gpuHashRate) || 0,
        expiresAt: iso(p.expiresAt),
        playedAt: iso(p.claimedAt)
      });
    }
    for (const p of gpuV2Powers) {
      expirations.push({
        source: "auto_mining_v2",
        slug: p.mode || null,
        name: "Auto Mining GPU (session)",
        hashRate: Number(p.hashRate) || 0,
        expiresAt: iso(p.expiresAt),
        playedAt: iso(p.earnedAt)
      });
    }
    expirations.sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));

    const gameBySlug = new Map();
    for (const g of gamePowers) {
      const slug = g.game?.slug || `power-game-${g.id}`;
      const name = g.game?.name || "Game";
      if (!gameBySlug.has(slug)) {
        gameBySlug.set(slug, { slug, name, totalHashRate: 0, items: [] });
      }
      const entry = gameBySlug.get(slug);
      const hr = Number(g.hashRate) || 0;
      entry.totalHashRate += hr;
      entry.items.push({
        id: g.id,
        hashRate: hr,
        expiresAt: iso(g.expiresAt),
        playedAt: iso(g.playedAt)
      });
    }

    const machinesActive = allMiners.filter((m) => m.isActive);
    const machinesInactive = allMiners.filter((m) => !m.isActive);
    const machineItems = allMiners.map((m) => ({
      id: m.id,
      slotIndex: m.slotIndex,
      isActive: m.isActive,
      hashRate: Number(m.hashRate) || 0,
      minerName: m.miner?.name || "Machine",
      minerSlug: m.miner?.slug || null,
      imageUrl: m.miner?.imageUrl || m.imageUrl || null,
      roomNumber: m.userRack?.room?.roomNumber ?? null,
      rackPosition: m.userRack?.position ?? null
    }));

    const byDay = new Map();
    for (const log of miningLogs) {
      const key = utcDateKey(new Date(log.createdAt));
      if (!byDay.has(key)) {
        byDay.set(key, { shareSum: 0, workSum: 0, n: 0 });
      }
      const b = byDay.get(key);
      b.shareSum += Number(log.sharePercentage) || 0;
      b.workSum += Number(log.workAccumulated) || 0;
      b.n += 1;
    }
    const miningLogByDay = [...byDay.entries()]
      .map(([date, v]) => ({
        date,
        avgSharePercent: v.n ? v.shareSum / v.n : 0,
        avgWork: v.n ? v.workSum / v.n : 0,
        samples: v.n
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const blkHistory = blkCycles.map((c) => ({
      windowStart: iso(c.windowStart),
      totalHashrate: Number(c.totalHashrate) || 0,
      minerCount: c.minerCount
    }));

    const sortedRank = buildRankingRows(allRankUsers);
    const rankInfo = computeUserRank(sortedRank, userId);

    const snap = await getBlkCyclePublicSnapshot();
    const lastPoolHr = snap.lastCycle?.totalHashrate ?? 0;
    const payoutMode = userRow.miningPayoutMode === "blk" ? "blk" : "pol";
    let poolSharePercent = null;
    if (payoutMode === "blk" && lastPoolHr > 0 && agg.totalHashrate > 0) {
      poolSharePercent = (agg.totalHashrate / lastPoolHr) * 100;
    }

    const nextCheckinPowerRewards = checkinHashMilestones
      .filter((m) => streak < m.dayThreshold)
      .slice(0, 5)
      .map((m) => ({
        dayThreshold: m.dayThreshold,
        rewardValue: Number(m.rewardValue) || 0,
        validityDays: m.validityDays,
        displayTitle: m.displayTitle
      }));

    res.json({
      ok: true,
      generatedAt: now.toISOString(),
      overview: {
        totalHashrate: agg.totalHashrate,
        permanentHashrate: agg.permanentHashrate,
        temporaryHashrate: agg.temporaryHashrate,
        permanentPercent: Math.round(permPct * 10) / 10,
        temporaryPercent: Math.round(tempPct * 10) / 10,
        breakdown: {
          machines: agg.permanentHashrate,
          gamesMinigame: agg.temporaryMinigameHashrate,
          gamesCheckin: agg.temporaryCheckinHashrate,
          youtube: agg.temporaryYoutubeHashrate,
          autoMining: agg.temporaryAutoMiningHashrate
        },
        miningPayoutMode: payoutMode,
        nextExpirations: expirations.slice(0, 12)
      },
      machines: {
        activeCount: machinesActive.length,
        inactiveCount: machinesInactive.length,
        activeHashrate: machinesActive.reduce((s, m) => s + (Number(m.hashRate) || 0), 0),
        inactiveHashrate: machinesInactive.reduce((s, m) => s + (Number(m.hashRate) || 0), 0),
        items: machineItems
      },
      youtube: {
        activeTotal: agg.temporaryYoutubeHashrate,
        activeItems: ytPowers.map((y) => ({
          id: y.id,
          hashRate: Number(y.hashRate) || 0,
          expiresAt: iso(y.expiresAt),
          sourceVideoId: y.sourceVideoId
        })),
        history: ytHistory.map((h) => ({
          id: h.id,
          hashRate: Number(h.hashRate) || 0,
          claimedAt: iso(h.claimedAt),
          expiresAt: iso(h.expiresAt),
          sourceVideoId: h.sourceVideoId,
          status: h.status,
          createdAt: iso(h.createdAt)
        }))
      },
      games: {
        minigameTotal: agg.temporaryMinigameHashrate,
        checkinBonusTotal: agg.temporaryCheckinHashrate,
        checkinBonusSlug: CHECKIN_BONUS_GAME_SLUG,
        byGame: [...gameBySlug.values()].sort((a, b) => b.totalHashRate - a.totalHashRate)
      },
      autoMining: {
        total: agg.temporaryAutoMiningHashrate,
        items: gpuPowers.map((p) => ({
          id: p.id,
          gpuHashRate: Number(p.gpuHashRate) || 0,
          expiresAt: iso(p.expiresAt),
          claimedAt: iso(p.claimedAt)
        }))
      },
      checkin: {
        streak,
        nextHashrateMilestones: nextCheckinPowerRewards
      },
      otherSources: {
        referralHashrate: 0,
        stakingHashrate: 0,
        eventBonusHashrate: 0,
        note: "No standalone referral/staking hashrate is stored; referrals affect other systems."
      },
      network: {
        userRank: rankInfo?.rank ?? null,
        totalRankedUsers: rankInfo?.totalUsers ?? sortedRank.length,
        activeUsersLast24h: activeUsers24h,
        lastBlkCycle: snap.lastCycle
          ? {
              id: snap.lastCycle.id,
              windowStart: snap.lastCycle.windowStart,
              totalHashrate: snap.lastCycle.totalHashrate,
              minerCount: snap.lastCycle.minerCount,
              totalReward: snap.lastCycle.totalReward,
              distributed: snap.lastCycle.distributed
            }
          : null,
        blkPoolSharePercent:
          poolSharePercent != null ? Math.round(poolSharePercent * 10000) / 10000 : null,
        rewardPerCycle: snap.rewardPerCycle,
        blkPaused: snap.paused,
        activityWindowSec: snap.activityWindowSec
      },
      payout: {
        rows: [
          {
            key: "pol",
            labelKey: "powerStats.payout.pol",
            percent: payoutMode === "pol" ? 100 : 0,
            noteKey: "powerStats.payout.pol_note"
          },
          {
            key: "blk",
            labelKey: "powerStats.payout.blk",
            percent: payoutMode === "blk" ? 100 : 0,
            noteKey: "powerStats.payout.blk_note"
          }
        ]
      },
      history: {
        miningLogByDay,
        blkCycles: blkHistory
      },
      projections: {
        permanentHashrate: agg.permanentHashrate,
        temporaryRemainingHashrate: agg.temporaryHashrate,
        hintKeys: [
          "powerStats.projection_hint_check_expiry",
          "powerStats.projection_hint_machines",
          "powerStats.projection_hint_minigames"
        ]
      },
      analytics: {
        miningLogPeakShare: miningLogs.length
          ? Math.max(...miningLogs.map((l) => Number(l.sharePercentage) || 0))
          : 0,
        miningLogAvgShare:
          miningLogs.length > 0
            ? miningLogs.reduce((s, l) => s + (Number(l.sharePercentage) || 0), 0) / miningLogs.length
            : 0,
        miningLogSamples: miningLogs.length
      }
    });
  } catch (e) {
    console.error("getPowerStats", e);
    res.status(500).json({ ok: false, message: "Unable to load power statistics." });
  }
}
