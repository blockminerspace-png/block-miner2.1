import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { REWARD_POL as INTERNAL_OFFERWALL_REWARD_POL } from "../internal-offerwall/internal-offerwall.config.js";
import { isAutoMiningV2SchemaAvailable } from "../auto-mining/index.js";
import { REFERRAL_STATS_SINCE } from "../../models/referralModel.js";

/** @deprecated Use REFERRAL_STATS_SINCE from referralModel */
export const REFERRAL_EARNINGS_STATS_SINCE = REFERRAL_STATS_SINCE;

export type EarningsPeriod = "7d" | "30d" | "90d" | "all";

export type EarningsTotals = {
  total: number;
  mining: number;
  offerwall: number;
  offerwallInternal: number;
  offerwallExternal: number;
  faucet: number;
  shortlinks: number;
  youtube: number;
  games: number;
  autoMining: number;
  checkin: number;
  referrals: number;
};

export type EarningsHistoryPoint = EarningsTotals & { date: string };

export type UserEarningsPayload = EarningsTotals & {
  referralStatsSince: string;
  period: EarningsPeriod;
  history: EarningsHistoryPoint[];
  powerMeta: {
    machineCount: number;
    activeBoosts: number;
    powerGained24h: number;
  };
};

function roundPol(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function resolveSince(period: EarningsPeriod): Date | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000);
}

function sinceFilter(since: Date | null, field: "createdAt" | "collectedAt" | "completedAt" | "callbackAt"): Record<string, unknown> {
  if (!since) return {};
  return { [field]: { gte: since } };
}

type InboxCategory =
  | "checkin"
  | "faucet"
  | "shortlinks"
  | "youtube"
  | "games"
  | "autoMining"
  | "offerwallInternal"
  | "referrals";

function mapInboxSourceToCategory(source: string): InboxCategory | null {
  const s = source.toLowerCase();
  if (s === "checkin_milestone") return "checkin";
  if (s === "faucet" || s === "faucet_power") return "faucet";
  if (s === "shortlink" || s === "shortlinks") return "shortlinks";
  if (s === "youtube" || s === "youtuber_reward") return "youtube";
  if (s === "auto_mining" || s === "auto_mining_v2") return "autoMining";
  if (s === "tournament" || s === "game" || s === "games" || s === "daily_task" || s === "burn_event") return "games";
  if (s === "offerwall" || s === "internal_offerwall") return "offerwallInternal";
  return null;
}

async function sumMiningPol(userId: number, since: Date | null): Promise<number> {
  const agg = await prisma.blockMinerReward.aggregate({
    _sum: { rewardAmount: true },
    where: { userId, ...sinceFilter(since, "createdAt") },
  });
  return Number(agg._sum.rewardAmount ?? 0);
}

async function sumZeradsPol(userId: number, since: Date | null): Promise<number> {
  const agg = await prisma.zeradsCallback.aggregate({
    _sum: { payoutAmount: true },
    where: { userId, ...sinceFilter(since, "callbackAt") },
  });
  return Number(agg._sum.payoutAmount ?? 0);
}

async function sumOfferwallMePol(userId: number, since: Date | null): Promise<number> {
  const agg = await prisma.offerwallMeCallback.aggregate({
    _sum: { polCredited: true },
    where: { userId, status: 1, ...sinceFilter(since, "createdAt") },
  });
  return Number(agg._sum.polCredited ?? 0);
}

async function sumInternalOfferwallPol(userId: number, since: Date | null): Promise<number> {
  const attempts = await prisma.internalOfferwallAttempt.findMany({
    where: {
      userId,
      status: "COMPLETED",
      ...sinceFilter(since, "completedAt"),
    },
    select: { offer: { select: { rewardKind: true, rewardPolAmount: true } } },
  });
  return attempts.reduce((sum, row) => {
    if (row.offer?.rewardKind !== INTERNAL_OFFERWALL_REWARD_POL) return sum;
    return sum + Number(row.offer.rewardPolAmount ?? 0);
  }, 0);
}

async function sumInboxPolByCategory(
  userId: number,
  since: Date | null,
): Promise<Partial<Record<keyof EarningsTotals, number>>> {
  const rows = await prisma.userRewardInbox.groupBy({
    by: ["source"],
    where: {
      userId,
      status: "collected",
      rewardType: "pol",
      ...sinceFilter(since, "collectedAt"),
    },
    _sum: { rewardValue: true },
  });

  const out: Partial<Record<InboxCategory, number>> = {};
  for (const row of rows) {
    const cat = mapInboxSourceToCategory(row.source);
    if (!cat) continue;
    const val = Number(row._sum.rewardValue ?? 0);
    out[cat] = (out[cat] ?? 0) + val;
    if (cat === "offerwallInternal") {
      // inbox offerwall entries are rare; keep separate from attempt-based internal totals
    }
  }
  return out;
}

async function sumReferralsPol(userId: number, since: Date | null): Promise<number> {
  const effectiveSince =
    since && since.getTime() > REFERRAL_STATS_SINCE.getTime() ? since : REFERRAL_STATS_SINCE;
  const agg = await prisma.referralEarning.aggregate({
    _sum: { amount: true },
    where: { referrerId: userId, createdAt: { gte: effectiveSince } },
  });
  return Number(agg._sum.amount ?? 0);
}

async function buildTotals(userId: number, since: Date | null): Promise<EarningsTotals> {
  const [mining, zerads, offerwallMe, offerwallInternalAttempts, inboxCats, referrals] = await Promise.all([
    sumMiningPol(userId, since),
    sumZeradsPol(userId, since),
    sumOfferwallMePol(userId, since),
    sumInternalOfferwallPol(userId, since),
    sumInboxPolByCategory(userId, since),
    sumReferralsPol(userId, since),
  ]);

  const offerwallInternal = roundPol(offerwallInternalAttempts + Number(inboxCats.offerwallInternal ?? 0));
  const offerwallExternal = roundPol(zerads + offerwallMe);
  const offerwall = roundPol(offerwallInternal + offerwallExternal);

  const totals: EarningsTotals = {
    mining: roundPol(mining),
    offerwallInternal,
    offerwallExternal,
    offerwall,
    faucet: roundPol(Number(inboxCats.faucet ?? 0)),
    shortlinks: roundPol(Number(inboxCats.shortlinks ?? 0)),
    youtube: roundPol(Number(inboxCats.youtube ?? 0)),
    games: roundPol(Number(inboxCats.games ?? 0)),
    autoMining: roundPol(Number(inboxCats.autoMining ?? 0)),
    checkin: roundPol(Number(inboxCats.checkin ?? 0)),
    referrals: roundPol(referrals),
    total: 0,
  };

  totals.total = roundPol(
    totals.mining +
      totals.offerwall +
      totals.faucet +
      totals.shortlinks +
      totals.youtube +
      totals.games +
      totals.autoMining +
      totals.checkin +
      totals.referrals,
  );

  return totals;
}

type DailyRow = { day: Date; pol: number; category: string };

async function fetchDailyMining(userId: number, since: Date | null): Promise<DailyRow[]> {
  const sinceClause = since ? Prisma.sql`AND created_at >= ${since}` : Prisma.empty;
  return prisma.$queryRaw<DailyRow[]>`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           COALESCE(SUM(reward_amount), 0)::float AS pol,
           'mining' AS category
    FROM block_miner_rewards
    WHERE user_id = ${userId} ${sinceClause}
    GROUP BY 1
  `;
}

async function fetchDailyZerads(userId: number, since: Date | null): Promise<DailyRow[]> {
  const sinceClause = since ? Prisma.sql`AND callback_at >= ${since}` : Prisma.empty;
  return prisma.$queryRaw<DailyRow[]>`
    SELECT date_trunc('day', callback_at AT TIME ZONE 'UTC')::date AS day,
           COALESCE(SUM(payout_amount), 0)::float AS pol,
           'offerwallExternal' AS category
    FROM zerads_ptc_callbacks
    WHERE user_id = ${userId} ${sinceClause}
    GROUP BY 1
  `;
}

async function fetchDailyOfferwallMe(userId: number, since: Date | null): Promise<DailyRow[]> {
  const sinceClause = since ? Prisma.sql`AND created_at >= ${since}` : Prisma.empty;
  return prisma.$queryRaw<DailyRow[]>`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           COALESCE(SUM(pol_credited), 0)::float AS pol,
           'offerwallExternal' AS category
    FROM offerwallme_callbacks
    WHERE user_id = ${userId} AND status = 1 ${sinceClause}
    GROUP BY 1
  `;
}

async function fetchDailyInbox(userId: number, since: Date | null): Promise<DailyRow[]> {
  const sinceClause = since ? Prisma.sql`AND collected_at >= ${since}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ day: Date; source: string; pol: number }>>`
    SELECT date_trunc('day', collected_at AT TIME ZONE 'UTC')::date AS day,
           source,
           COALESCE(SUM(reward_value), 0)::float AS pol
    FROM user_reward_inbox
    WHERE user_id = ${userId}
      AND status = 'collected'
      AND reward_type = 'pol'
      ${sinceClause}
    GROUP BY 1, 2
  `;
  const mapped: DailyRow[] = [];
  for (const r of rows) {
    const cat = mapInboxSourceToCategory(r.source);
    if (!cat) continue;
    mapped.push({ day: r.day, pol: r.pol, category: cat });
  }
  return mapped;
}

async function fetchDailyReferrals(userId: number, since: Date | null): Promise<DailyRow[]> {
  const effectiveSince =
    since && since.getTime() > REFERRAL_STATS_SINCE.getTime() ? since : REFERRAL_STATS_SINCE;
  return prisma.$queryRaw<DailyRow[]>`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           COALESCE(SUM(amount), 0)::float AS pol,
           'referrals' AS category
    FROM referral_earnings
    WHERE referrer_id = ${userId}
      AND created_at >= ${effectiveSince}
    GROUP BY 1
  `;
}

async function fetchDailyInternalOfferwall(userId: number, since: Date | null): Promise<DailyRow[]> {
  const attempts = await prisma.internalOfferwallAttempt.findMany({
    where: {
      userId,
      status: "COMPLETED",
      ...sinceFilter(since, "completedAt"),
    },
    select: {
      completedAt: true,
      offer: { select: { rewardKind: true, rewardPolAmount: true } },
    },
  });
  const byDay = new Map<string, number>();
  for (const a of attempts) {
    if (a.offer?.rewardKind !== INTERNAL_OFFERWALL_REWARD_POL || !a.completedAt) continue;
    const key = a.completedAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(a.offer.rewardPolAmount ?? 0));
  }
  return Array.from(byDay.entries()).map(([day, pol]) => ({
    day: new Date(`${day}T00:00:00.000Z`),
    pol,
    category: "offerwallInternal",
  }));
}

function mergeDailyRows(rows: DailyRow[]): Map<string, EarningsHistoryPoint> {
  const byDate = new Map<string, EarningsHistoryPoint>();

  const ensure = (dateKey: string): EarningsHistoryPoint => {
    let row = byDate.get(dateKey);
    if (!row) {
      row = {
        date: dateKey,
        total: 0,
        mining: 0,
        offerwall: 0,
        offerwallInternal: 0,
        offerwallExternal: 0,
        faucet: 0,
        shortlinks: 0,
        youtube: 0,
        games: 0,
        autoMining: 0,
        checkin: 0,
        referrals: 0,
      };
      byDate.set(dateKey, row);
    }
    return row;
  };

  for (const r of rows) {
    const dateKey = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
    const row = ensure(dateKey);
    const pol = Number(r.pol) || 0;
    const cat = r.category as keyof EarningsTotals;
    if (cat in row && cat !== "total" && cat !== "offerwall") {
      (row[cat] as number) = roundPol((row[cat] as number) + pol);
    }
  }

  for (const row of byDate.values()) {
    row.offerwall = roundPol(row.offerwallInternal + row.offerwallExternal);
    row.total = roundPol(
      row.mining +
        row.offerwall +
        row.faucet +
        row.shortlinks +
        row.youtube +
        row.games +
        row.autoMining +
        row.checkin +
        row.referrals,
    );
  }

  return byDate;
}

function toCumulativeHistory(points: EarningsHistoryPoint[]): EarningsHistoryPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const cumulative: EarningsHistoryPoint = {
    date: "",
    total: 0,
    mining: 0,
    offerwall: 0,
    offerwallInternal: 0,
    offerwallExternal: 0,
    faucet: 0,
    shortlinks: 0,
    youtube: 0,
    games: 0,
    autoMining: 0,
    checkin: 0,
    referrals: 0,
  };

  return sorted.map((p) => {
    cumulative.mining = roundPol(cumulative.mining + p.mining);
    cumulative.offerwallInternal = roundPol(cumulative.offerwallInternal + p.offerwallInternal);
    cumulative.offerwallExternal = roundPol(cumulative.offerwallExternal + p.offerwallExternal);
    cumulative.offerwall = roundPol(cumulative.offerwall + p.offerwall);
    cumulative.faucet = roundPol(cumulative.faucet + p.faucet);
    cumulative.shortlinks = roundPol(cumulative.shortlinks + p.shortlinks);
    cumulative.youtube = roundPol(cumulative.youtube + p.youtube);
    cumulative.games = roundPol(cumulative.games + p.games);
    cumulative.autoMining = roundPol(cumulative.autoMining + p.autoMining);
    cumulative.checkin = roundPol(cumulative.checkin + p.checkin);
    cumulative.referrals = roundPol(cumulative.referrals + p.referrals);
    cumulative.total = roundPol(cumulative.total + p.total);
    return { ...cumulative, date: p.date };
  });
}

async function loadPowerMeta(userId: number, now: Date): Promise<UserEarningsPayload["powerMeta"]> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const v2Ok = await isAutoMiningV2SchemaAvailable();
  const [machineCount, gameBoosts, ytBoosts, gpuBoosts, v2Boosts, gainedGames, gainedYt, gainedShort, gainedGpu] =
    await Promise.all([
      prisma.userMiner.count({ where: { userId } }),
      prisma.userPowerGame.count({ where: { userId, expiresAt: { gt: now } } }),
      prisma.youtubeWatchPower.count({ where: { userId, expiresAt: { gt: now } } }),
      prisma.autoMiningGpu.count({ where: { userId, isClaimed: true, expiresAt: { gt: now } } }),
      v2Ok
        ? prisma.autoMiningV2PowerGrant.count({ where: { userId, expiresAt: { gt: now } } })
        : Promise.resolve(0),
      prisma.userPowerGame.aggregate({
        _sum: { hashRate: true },
        where: { userId, playedAt: { gte: dayAgo } },
      }),
      prisma.youtubeWatchPower.aggregate({
        _sum: { hashRate: true },
        where: { userId, claimedAt: { gte: dayAgo } },
      }),
      prisma.shortlinkPower.aggregate({
        _sum: { hashRate: true },
        where: { userId, claimedAt: { gte: dayAgo } },
      }),
      prisma.autoMiningGpu.aggregate({
        _sum: { gpuHashRate: true },
        where: { userId, claimedAt: { gte: dayAgo } },
      }),
    ]);

  const activeBoosts = gameBoosts + ytBoosts + gpuBoosts + Number(v2Boosts);
  const powerGained24h =
    Number(gainedGames._sum.hashRate ?? 0) +
    Number(gainedYt._sum.hashRate ?? 0) +
    Number(gainedShort._sum.hashRate ?? 0) +
    Number(gainedGpu._sum.gpuHashRate ?? 0);

  return {
    machineCount,
    activeBoosts,
    powerGained24h: Math.round(powerGained24h),
  };
}

export function parseEarningsPeriod(raw: unknown): EarningsPeriod {
  const p = String(raw ?? "30d").trim().toLowerCase();
  if (p === "7d" || p === "30d" || p === "90d" || p === "all") return p;
  return "30d";
}

export async function getUserEarningsStats(userId: number, period: EarningsPeriod): Promise<UserEarningsPayload> {
  const since = resolveSince(period);
  const now = new Date();

  const [totals, dailyMining, dailyZerads, dailyOfm, dailyInbox, dailyReferrals, dailyInternal, powerMeta] =
    await Promise.all([
      buildTotals(userId, null),
      fetchDailyMining(userId, since),
      fetchDailyZerads(userId, since),
      fetchDailyOfferwallMe(userId, since),
      fetchDailyInbox(userId, since),
      fetchDailyReferrals(userId, since),
      fetchDailyInternalOfferwall(userId, since),
      loadPowerMeta(userId, now),
    ]);

  const merged = mergeDailyRows([
    ...dailyMining,
    ...dailyZerads,
    ...dailyOfm,
    ...dailyInbox,
    ...dailyReferrals,
    ...dailyInternal,
  ]);

  const history = toCumulativeHistory(Array.from(merged.values()));

  return {
    ...totals,
    referralStatsSince: REFERRAL_STATS_SINCE.toISOString().slice(0, 10),
    period,
    history,
    powerMeta,
  };
}
