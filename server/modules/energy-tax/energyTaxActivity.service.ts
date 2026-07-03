import prisma from "../../src/db/prisma.js";
import { normalizeBrazilDateKey } from "../../utils/checkinDate.js";
import { getCheckinPeriodLookupKeys } from "../checkin/checkin.calendar.js";
import { miningPeriodEndKey } from "./energyTax.service.js";

/**
 * Fonte única de verdade da Taxa de Energia — atividades e base de mineração.
 *
 * Consumido por: página de taxas (`computeWeekSummary`), cobrança manual
 * (`payDailyTax`), cron semanal (`runWeeklySweep`), simulação, histórico e
 * admin. Toda superfície que precise saber "quanto o usuário minerou" ou
 * "quantas atividades fez" no dia de mineração 21h→21h BRT passa por aqui.
 */

export const ACTIVITY_DISCOUNT_THRESHOLD = 10;

const INTERNAL_OFFERWALL_REWARD_POL = "POL"; // ver internal-offerwall.config.ts

export type ActivityBreakdown = {
  offerwallInt: number;   // InternalOfferwallAttempt status=COMPLETED
  offerwallMe: number;    // OfferwallMeCallback status=1 (cada callback = 1 atividade)
  zeradsClicks: number;   // SUM(ZeradsCallback.clicks) — creditedClicks pós-cap
  faucet: number;         // FaucetClaim.totalClaims do dayKey do período
  shortlink: number;      // ShortlinkPower.claimedAt
  youtube: number;        // YoutubeWatchPower.claimedAt
  games: number;          // UserPowerGame.playedAt
  total: number;
  exempt: boolean;
};

export type MiningBreakdown = {
  blockMiner: number;   // BlockMinerReward.rewardAmount
  zerads: number;       // ZeradsCallback.payoutAmount
  offerwallMe: number;  // OfferwallMeCallback.polCredited (status=1)
  offerwallInt: number; // Offer.rewardPolAmount para attempts COMPLETED do tipo REWARD_POL
  total: number;
};

/** Fim exclusivo do período de mineração (21h BRT + 24h) — mesma janela usada
 *  no restante do módulo, calculada a partir do endKey do site. */
function periodEnd(periodStart: Date): Date {
  // periodStart é 21h BRT do dia N-1; adiciona 24h para chegar em 21h BRT do dia N.
  return new Date(periodStart.getTime() + 24 * 3600 * 1000);
}

export async function getActivitiesForPeriod(
  userId: number,
  periodStart: Date,
): Promise<ActivityBreakdown> {
  const dayEnd = periodEnd(periodStart);
  const periodEndKey = miningPeriodEndKey(new Date(periodStart.getTime() + 3600 * 1000));
  const periodKeyAliases = new Set(getCheckinPeriodLookupKeys(periodEndKey));

  const [
    offerwallInt,
    offerwallMe,
    zeradsAgg,
    shortlink,
    youtube,
    games,
    faucetRecord,
  ] = await Promise.all([
    prisma.internalOfferwallAttempt.count({
      where: { userId, status: "COMPLETED", completedAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.offerwallMeCallback.count({
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.zeradsCallback.aggregate({
      _sum: { clicks: true },
      where: { userId, callbackAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.shortlinkPower.count({
      where: { userId, claimedAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.youtubeWatchPower.count({
      where: { userId, claimedAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.userPowerGame.count({
      where: { userId, playedAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.faucetClaim.findUnique({
      where: { userId },
      select: { dayKey: true, totalClaims: true },
    }),
  ]);

  const zeradsClicks = Number(zeradsAgg._sum.clicks ?? 0);
  const faucet =
    faucetRecord && faucetRecord.dayKey && periodKeyAliases.has(normalizeBrazilDateKey(faucetRecord.dayKey))
      ? faucetRecord.totalClaims
      : 0;

  const total =
    offerwallInt + offerwallMe + zeradsClicks + faucet + shortlink + youtube + games;

  return {
    offerwallInt,
    offerwallMe,
    zeradsClicks,
    faucet,
    shortlink,
    youtube,
    games,
    total,
    exempt: total >= ACTIVITY_DISCOUNT_THRESHOLD,
  };
}

export async function getMiningRewardsForPeriod(
  userId: number,
  periodStart: Date,
): Promise<MiningBreakdown> {
  const dayEnd = periodEnd(periodStart);

  const [blockMinerAgg, zeradsAgg, offerwallMeAgg, internalAttempts] = await Promise.all([
    prisma.blockMinerReward.aggregate({
      _sum: { rewardAmount: true },
      where: { userId, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.zeradsCallback.aggregate({
      _sum: { payoutAmount: true },
      where: { userId, callbackAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.offerwallMeCallback.aggregate({
      _sum: { polCredited: true },
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    // InternalOfferwallAttempt não guarda o valor de POL creditado; junta com o
    // Offer para saber quanto o attempt REWARD_POL rendeu na época do grant.
    prisma.internalOfferwallAttempt.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: periodStart, lt: dayEnd },
      },
      select: { offer: { select: { rewardKind: true, rewardPolAmount: true } } },
    }),
  ]);

  const blockMiner = Number(blockMinerAgg._sum.rewardAmount ?? 0);
  const zerads = Number(zeradsAgg._sum.payoutAmount ?? 0);
  const offerwallMe = Number(offerwallMeAgg._sum.polCredited ?? 0);
  const offerwallInt = internalAttempts.reduce((sum, a) => {
    const kind = a.offer?.rewardKind;
    const amt = a.offer?.rewardPolAmount;
    if (kind === INTERNAL_OFFERWALL_REWARD_POL && amt) return sum + Number(amt);
    return sum;
  }, 0);

  const total = blockMiner + zerads + offerwallMe + offerwallInt;

  return { blockMiner, zerads, offerwallMe, offerwallInt, total };
}

/** IDs de usuários com QUALQUER crédito POL na janela (usado pelo cron). */
export async function findUsersWithRewardsInWindow(
  from: Date,
  to: Date,
): Promise<number[]> {
  const [miners, zerads, ofmMe, internal] = await Promise.all([
    prisma.blockMinerReward.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: from, lt: to } },
    }),
    prisma.zeradsCallback.groupBy({
      by: ["userId"],
      where: { callbackAt: { gte: from, lt: to } },
    }),
    prisma.offerwallMeCallback.groupBy({
      by: ["userId"],
      where: { status: 1, createdAt: { gte: from, lt: to } },
    }),
    prisma.internalOfferwallAttempt.groupBy({
      by: ["userId"],
      where: { status: "COMPLETED", completedAt: { gte: from, lt: to } },
    }),
  ]);

  const set = new Set<number>();
  for (const r of miners) set.add(r.userId);
  for (const r of zerads) set.add(r.userId);
  for (const r of ofmMe) set.add(r.userId);
  for (const r of internal) set.add(r.userId);
  return Array.from(set);
}
