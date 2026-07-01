import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { addDaysToBrazilDateKey, normalizeBrazilDateKey } from "../../utils/checkinDate.js";
import { getCheckinPeriodEndKey, getPeriodStartAt, getCheckinPeriodLookupKeys } from "../checkin/checkin.calendar.js";
import { getCheckinResetHour } from "../checkin/checkin.config.js";

/**
 * Taxa de Energia — regras de negócio em docs/rules/ENERGY_TAX.md.
 *
 * Modelo: 3 regimes (diário 5%, semanal 15%, isenção por atividade 0%).
 * Taxas são SEMPRE por dia, sobre o minerado daquele dia — nunca retroativo.
 *
 * Fonte única de verdade para corte: `computeConsecutiveUnpaidMiningDays`, usada
 * tanto pelo bloqueio real (`checkAndUpdateEnergyBlock`) quanto pelo banner do
 * dashboard (`unpaidDays` em `computeWeekSummary`), evitando divergência.
 */
const logger = loggerLib.child("EnergyTax");

const TZ = "America/Sao_Paulo";

/** Rate constants — see TaxesPage spec.
 *
 *  • FULL_WEEK_RATE  = 15% — cobrança automática segunda 21h (multa por acumular)
 *  • DAILY_WEEK_RATE = 5%  — paga 1× por dia (7 dias seguidos) → grande economia
 *  • Quem paga todo dia fica com 5% no total da semana; quem deixa para segunda paga 15%.
 */
export const FULL_WEEK_RATE = 0.15;   // 15% — cobrança automática segunda 21h (deixa acumular)
export const DAILY_WEEK_RATE = 0.05;  // 5%  — paga 1× por dia (7 dias seguidos)
export const DAILY_PER_DAY_RATE = DAILY_WEEK_RATE / 7; // 0.7143% por dia
export const AUTO_PER_DAY_RATE  = FULL_WEEK_RATE  / 7; // 2.1429% por dia

/**
 * Feature flag temporal — a taxa de energia passa a valer 29/06/2026 21:00 BRT.
 * Antes desse instante: nenhuma cobrança (manual ou cron) é permitida.
 * Pode ser ajustado via env `ENERGY_TAX_STARTS_AT_ISO` (formato UTC ISO).
 */
const DEFAULT_STARTS_AT_ISO = "2026-06-30T00:00:00.000Z"; // 29/06/2026 21:00 BRT
export const ENERGY_TAX_STARTS_AT = new Date(
  process.env.ENERGY_TAX_STARTS_AT_ISO || DEFAULT_STARTS_AT_ISO,
);

export function isEnergyTaxActive(now: Date = new Date()): boolean {
  return now.getTime() >= ENERGY_TAX_STARTS_AT.getTime();
}

function energyTaxPeriodConfig() {
  return {
    timezone: TZ,
    resetHour: getCheckinResetHour(),
    graceHours: 0,
  };
}

/** Period end dateKey (site day label) — rolls at resetHour BRT (default 21h). */
export function miningPeriodEndKey(date: Date = new Date()): string {
  return getCheckinPeriodEndKey(date, energyTaxPeriodConfig());
}

/** Start instant of a mining period (21h BRT), by period end dateKey. */
export function miningPeriodStartFromEndKey(endKey: string): Date {
  return getPeriodStartAt(normalizeBrazilDateKey(endKey), energyTaxPeriodConfig());
}

/** Start of the mining period that contains `date`. */
export function miningPeriodStart(date: Date = new Date()): Date {
  return miningPeriodStartFromEndKey(miningPeriodEndKey(date));
}

/** Start of the last fully closed mining period — target of "Pagar hoje". */
export function lastClosedMiningPeriodStart(now: Date = new Date()): Date {
  const closedEndKey = addDaysToBrazilDateKey(miningPeriodEndKey(now), -1);
  return miningPeriodStartFromEndKey(closedEndKey);
}

/** Primeiro período minerado taxável (início às 21h BRT do dia de lançamento). */
export function firstTaxableBrtDayStart(): Date {
  return miningPeriodStart(ENERGY_TAX_STARTS_AT);
}

export function isTaxableBrtDay(dayStart: Date): boolean {
  return dayStart.getTime() >= firstTaxableBrtDayStart().getTime();
}

function nextMiningPeriodStart(dayStart: Date): Date {
  const endKey = miningPeriodEndKey(new Date(dayStart.getTime() + 12 * 3600000));
  return miningPeriodStartFromEndKey(addDaysToBrazilDateKey(endKey, 1));
}

/** @deprecated Use miningPeriodStart — kept for tests/imports. */
export function brtDayStart(date: Date = new Date()): Date {
  return miningPeriodStart(date);
}

/** Últimos 7 períodos de mineração (21h BRT). Ordem: mais antigo → mais novo. */
export function lastSevenBrtDays(now: Date = new Date()): Date[] {
  return lastSevenMiningPeriodStarts(now);
}

export function lastSevenMiningPeriodStarts(now: Date = new Date()): Date[] {
  const currentEndKey = miningPeriodEndKey(now);
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const endKey = addDaysToBrazilDateKey(currentEndKey, -i);
    days.push(miningPeriodStartFromEndKey(endKey));
  }
  return days;
}

export const ACTIVITY_DISCOUNT_THRESHOLD = 10; // atividades por dia para isenção total

export type TodayActivities = {
  offerwallExtCount: number;   // OfferwallMe callbacks (status=1)
  offerwallIntCount: number;   // Internal offerwall attempts (status='COMPLETED')
  faucetCount: number;         // Faucet claims (FaucetClaim.totalClaims no dayKey de hoje)
  shortlinkCount: number;      // ShortlinkPower claims
  youtubeCount: number;        // YoutubeWatchPower claims
  gamesCount: number;          // UserPowerGame plays
  totalActivities: number;     // soma de todas as fontes
  exempt: boolean;
};

/** Conta atividades de múltiplas fontes para o dia BRT informado. */
export async function countTodayActivities(
  userId: number,
  periodStart: Date,
): Promise<TodayActivities> {
  const dayEnd = nextMiningPeriodStart(periodStart);
  const periodEndKey = miningPeriodEndKey(new Date(periodStart.getTime() + 3600000));
  const periodKeyAliases = new Set(getCheckinPeriodLookupKeys(periodEndKey));

  const [
    offerwallExtCount,
    offerwallIntCount,
    shortlinkCount,
    youtubeCount,
    gamesCount,
    faucetRecord,
  ] = await Promise.all([
    prisma.offerwallMeCallback.count({
      where: { userId, status: 1, createdAt: { gte: periodStart, lt: dayEnd } },
    }),
    prisma.internalOfferwallAttempt.count({
      // O enum interno grava "COMPLETED" em maiúsculas (ver internalOfferwallConstants.ts).
      where: { userId, status: "COMPLETED", completedAt: { gte: periodStart, lt: dayEnd } },
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
    prisma.faucetClaim.findUnique({ where: { userId }, select: { dayKey: true, totalClaims: true } }),
  ]);

  const faucetCount =
    faucetRecord && periodKeyAliases.has(normalizeBrazilDateKey(faucetRecord.dayKey))
      ? faucetRecord.totalClaims
      : 0;
  const totalActivities = offerwallExtCount + offerwallIntCount + shortlinkCount + youtubeCount + gamesCount + faucetCount;

  return {
    offerwallExtCount,
    offerwallIntCount,
    faucetCount,
    shortlinkCount,
    youtubeCount,
    gamesCount,
    totalActivities,
    exempt: totalActivities >= ACTIVITY_DISCOUNT_THRESHOLD,
  };
}

/** Soma de POL minerado num intervalo (BlockMinerReward.rewardAmount). */
async function sumRewardsBetween(userId: number, fromInclusive: Date, toExclusive: Date): Promise<number> {
  const agg = await prisma.blockMinerReward.aggregate({
    where: { userId, createdAt: { gte: fromInclusive, lt: toExclusive } },
    _sum: { rewardAmount: true },
  });
  return Number(agg._sum.rewardAmount ?? 0);
}

/**
 * Conta dias consecutivos, de hoje para trás, que contam como "devendo" para fins de
 * corte de energia. Um dia conta como devendo quando:
 *   1. Teve mineração (rewards > 0), E
 *   2. NÃO teve charge quitado (qualquer status paid/partial/skipped/exempt), E
 *   3. NÃO foi isento por atividade (10+ atividades no dia).
 *
 * A contagem para no primeiro dia que NÃO deve (sem mineração, pago, ou isento).
 * É a ÚNICA fonte de verdade usada tanto pelo bloqueio real
 * (`checkAndUpdateEnergyBlock`) quanto pelo aviso/banner do dashboard — assim os
 * dois nunca divergem (bug histórico B2).
 *
 * Retorna `{ consecutiveUnpaid, willBlock }` onde willBlock = consecutiveUnpaid >= 3.
 */
export async function computeConsecutiveUnpaidMiningDays(
  userId: number,
  now: Date = new Date(),
): Promise<{ consecutiveUnpaid: number; willBlock: boolean }> {
  const days = lastSevenBrtDays(now);

  const charges = await prisma.energyTaxCharge.findMany({
    where: { userId, periodDayStartsAt: { gte: days[0], lt: nextMiningPeriodStart(days[6]) } },
    select: { periodDayStartsAt: true },
  });
  const paidKeys = new Set(charges.map((c) => c.periodDayStartsAt.getTime()));

  let consecutiveUnpaid = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const dayStart = days[i];
    const dayEnd = nextMiningPeriodStart(dayStart);

    const rewards = await prisma.blockMinerReward.aggregate({
      where: { userId, createdAt: { gte: dayStart, lt: dayEnd } },
      _sum: { rewardAmount: true },
    });
    const hadRewards = Number(rewards._sum.rewardAmount ?? 0) > 0;
    if (!hadRewards) break; // dia sem mineração não conta como devendo

    if (paidKeys.has(dayStart.getTime())) break; // dia quitado (pago/isento) para contagem

    // Isenção por atividade: 10+ atividades no dia = dia quitado (bug B3).
    // Obs.: hoje (último dia) normalmente ainda está em andamento, mas a isenção
    // é determinística (10+ atividades já feitas), então conta como quitado.
    const act = await countTodayActivities(userId, dayStart);
    if (act.exempt) break;

    consecutiveUnpaid++;
  }

  return { consecutiveUnpaid, willBlock: consecutiveUnpaid >= 3 };
}

export async function rewardsForBrtDay(userId: number, dayStart: Date): Promise<number> {
  return sumRewardsBetween(userId, dayStart, nextMiningPeriodStart(dayStart));
}

export type EnergyTaxSummary = {
  startsAt: string;       // ISO — feature gating; antes desse instante UI deve mostrar "começa em X"
  active: boolean;        // true se now >= startsAt
  weekStart: string;      // ISO
  weekEnd: string;        // ISO
  totalRewards7d: number;
  fullRateTax: number;    // 15% × total (deixar para segunda)
  dailyRateTax: number;   // 5% × total (pagar todo dia)
  paidPol: number;        // já debitado (sum de charges existentes)
  paidDays: number;       // contagem de dias com charge
  paidDaysManual: number;
  paidDaysAuto: number;
  paidDaysExempt: number;
  unpaidDays: number;
  todayPaid: boolean;
  todayRewards: number;
  yesterdayRewards: number;   // base real da cobrança diária de hoje
  todayDailyCharge: number; // valor que seria debitado ao clicar "Pagar hoje" agora
  todayExempt: boolean;
  offerwallExtToday: number;
  offerwallIntToday: number;
  faucetToday: number;
  shortlinkToday: number;
  youtubeToday: number;
  gamesToday: number;
  totalActivitiesToday: number;
  resetHour: number;
  lastClosedPeriodEndKey: string;
  currentPeriodEndKey: string;
  days: Array<{
    dayStart: string;
    periodEndKey: string;
    rewards: number;
    charge: { id: number; mode: string; amount: number; ratePercent: number; status: string; createdAt: string } | null;
  }>;
  history: Array<{ id: number; mode: string; amount: number; ratePercent: number; rewardsBase: number; status: string; periodDayStartsAt: string; createdAt: string }>;
};

export async function computeWeekSummary(userId: number, now: Date = new Date()): Promise<EnergyTaxSummary> {
  const days = lastSevenMiningPeriodStarts(now);
  const weekStart = days[0];
  const weekEnd = nextMiningPeriodStart(days[6]);
  const currentEndKey = miningPeriodEndKey(now);
  const closedEndKey = addDaysToBrazilDateKey(currentEndKey, -1);
  const closedStart = lastClosedMiningPeriodStart(now);
  const currentStart = miningPeriodStart(now);

  // Charges existentes nessa janela
  const existingCharges = await prisma.energyTaxCharge.findMany({
    where: { userId, periodDayStartsAt: { gte: weekStart, lt: weekEnd } },
  });
  const chargeByDay = new Map<number, typeof existingCharges[number]>();
  for (const c of existingCharges) chargeByDay.set(c.periodDayStartsAt.getTime(), c);

  // Rewards por dia (paraleliza)
  const rewardsByDay = await Promise.all(days.map((d) => rewardsForBrtDay(userId, d)));

  let totalRewards7d = 0;
  let paidPol = 0;
  let paidDays = 0;
  let paidDaysManual = 0;
  let paidDaysAuto = 0;
  let paidDaysExempt = 0;
  for (let i = 0; i < days.length; i++) {
    totalRewards7d += rewardsByDay[i];
    const c = chargeByDay.get(days[i].getTime());
    if (c) {
      paidPol += Number(c.amount);
      paidDays += 1;
      if (c.mode === "daily") paidDaysManual += 1;
      else if (c.mode === "auto") paidDaysAuto += 1;
      else if (c.mode === "exempt") paidDaysExempt += 1;
    }
  }
  const closedCharge = chargeByDay.get(closedStart.getTime()) ?? null;
  const closedRewards = await rewardsForBrtDay(userId, closedStart);
  const todayRewards = rewardsByDay[6];
  // "Pagar hoje" quita o último período fechado (21h BRT), não o período aberto.
  const yesterdayRewards = closedRewards;
  const todayDailyCharge = Number((closedRewards * DAILY_PER_DAY_RATE).toFixed(8));

  const todayAct = await countTodayActivities(userId, currentStart);

  // unpaidDays alinhado à regra real de bloqueio (bug B2): conta apenas dias
  // consecutivos minerados sem quitação (pago OU isento por atividade).
  // Antes era `7 - paidDays`, que inflava o aviso de corte e apavorava quem
  // escolheu o regime semanal ou tinha dias sem minerar.
  const { consecutiveUnpaid: unpaidDays } = await computeConsecutiveUnpaidMiningDays(userId, now);

  const periodEndKeys = Array.from({ length: 7 }, (_, i) =>
    addDaysToBrazilDateKey(currentEndKey, i - 6),
  );

  // #region agent log
  fetch("http://127.0.0.1:7302/ingest/aa95698d-f2ba-4f90-9481-c66442ef8e02", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "64b401" },
    body: JSON.stringify({
      sessionId: "64b401",
      runId: "pre-fix",
      hypothesisId: "H1-H3",
      location: "energyTax.service.ts:computeWeekSummary",
      message: "mining period boundaries",
      data: {
        now: now.toISOString(),
        resetHour: getCheckinResetHour(),
        currentEndKey,
        closedEndKey,
        closedStart: closedStart.toISOString(),
        todayPaid: !!closedCharge,
        closedRewards,
        todayRewards,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  // Histórico maior — últimas 50
  const history = await prisma.energyTaxCharge.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    take: 50,
  });

  return {
    startsAt: ENERGY_TAX_STARTS_AT.toISOString(),
    active: isEnergyTaxActive(now),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totalRewards7d,
    fullRateTax: Number((totalRewards7d * FULL_WEEK_RATE).toFixed(8)),
    dailyRateTax: Number((totalRewards7d * DAILY_WEEK_RATE).toFixed(8)),
    paidPol,
    paidDays,
    paidDaysManual,
    paidDaysAuto,
    paidDaysExempt,
    unpaidDays,
    todayPaid: !!closedCharge,
    todayRewards,
    yesterdayRewards,
    todayDailyCharge,
    todayExempt: todayAct.exempt,
    offerwallExtToday: todayAct.offerwallExtCount,
    offerwallIntToday: todayAct.offerwallIntCount,
    faucetToday: todayAct.faucetCount,
    shortlinkToday: todayAct.shortlinkCount,
    youtubeToday: todayAct.youtubeCount,
    gamesToday: todayAct.gamesCount,
    totalActivitiesToday: todayAct.totalActivities,
    resetHour: getCheckinResetHour(),
    lastClosedPeriodEndKey: closedEndKey,
    currentPeriodEndKey: currentEndKey,
    days: days.map((d, i) => {
      const c = chargeByDay.get(d.getTime());
      return {
        dayStart: d.toISOString(),
        periodEndKey: periodEndKeys[i],
        rewards: rewardsByDay[i],
        charge: c
          ? {
              id: c.id,
              mode: c.mode,
              amount: Number(c.amount),
              ratePercent: Number(c.ratePercent),
              status: c.status,
              createdAt: c.createdAt.toISOString(),
            }
          : null,
      };
    }),
    history: history.map((c) => ({
      id: c.id,
      mode: c.mode,
      amount: Number(c.amount),
      ratePercent: Number(c.ratePercent),
      rewardsBase: Number(c.rewardsBase),
      status: c.status,
      periodDayStartsAt: c.periodDayStartsAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export class EnergyTaxNotStarted extends Error {
  constructor(public startsAt: Date) {
    super(`A Taxa de Energia entra em vigor em ${startsAt.toISOString()}.`);
    this.name = "EnergyTaxNotStarted";
  }
}
export class EnergyTaxAlreadyPaid extends Error {
  constructor() { super("Você já quitou a taxa de energia de ontem."); this.name = "EnergyTaxAlreadyPaid"; }
}
export class EnergyTaxNoRewards extends Error {
  constructor() { super("Você não minerou nada ontem — sem taxa pra cobrar."); this.name = "EnergyTaxNoRewards"; }
}
export class EnergyTaxInsufficientBalance extends Error {
  constructor(public required: number, public available: number) {
    super(`Saldo insuficiente: precisa de ${required} POL, tem ${available} POL.`);
    this.name = "EnergyTaxInsufficientBalance";
  }
}

/**
 * Pagamento manual diário. Idempotente: 1 charge por (userId, dia-minerado-BRT).
 * "Pagar hoje" quita a taxa sobre o minerado de ontem; periodDayStartsAt = ontem.
 */
export async function payDailyTax(userId: number, now: Date = new Date()) {
  if (!isEnergyTaxActive(now)) throw new EnergyTaxNotStarted(ENERGY_TAX_STARTS_AT);
  const taxedDay = lastClosedMiningPeriodStart(now);
  const currentPeriodStart = miningPeriodStart(now);

  if (!isTaxableBrtDay(taxedDay)) throw new EnergyTaxNoRewards();

  const existing = await prisma.energyTaxCharge.findUnique({
    where: { userId_periodDayStartsAt: { userId, periodDayStartsAt: taxedDay } },
  });
  if (existing) throw new EnergyTaxAlreadyPaid();

  const rewards = await rewardsForBrtDay(userId, taxedDay);
  if (rewards <= 0) throw new EnergyTaxNoRewards();

  const { exempt } = await countTodayActivities(userId, currentPeriodStart);

  if (exempt) {
    const charge = await prisma.energyTaxCharge.create({
      data: {
        userId,
        periodDayStartsAt: taxedDay,
        mode: "exempt",
        rewardsBase: new Prisma.Decimal(rewards.toFixed(8)),
        ratePercent: new Prisma.Decimal("0"),
        amount: new Prisma.Decimal("0"),
        status: "paid",
        notes: "Isento: 10+ atividades no dia do pagamento",
      },
    });
    logger.info("exempt charge created", { userId, taxedDay });
    await checkAndUpdateEnergyBlock(userId);
    return charge;
  }

  const amount = Number((rewards * DAILY_PER_DAY_RATE).toFixed(8));
  const amountDec = new Prisma.Decimal(amount);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { polBalance: true } });
    if (!user) throw new Error("User not found");
    const balance = Number(user.polBalance);
    if (balance < amount) throw new EnergyTaxInsufficientBalance(amount, balance);

    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: "energy_tax",
        amount: amountDec,
        status: "completed",
        completedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { polBalance: { decrement: amountDec } },
    });

    const charge = await tx.energyTaxCharge.create({
      data: {
        userId,
        periodDayStartsAt: taxedDay,
        mode: "daily",
        rewardsBase: new Prisma.Decimal(rewards.toFixed(8)),
        ratePercent: new Prisma.Decimal((DAILY_PER_DAY_RATE * 100).toFixed(4)),
        amount: amountDec,
        status: "paid",
        transactionId: transaction.id,
      },
    });
    return charge;
  });

  logger.info("daily charge created", { userId, taxedDay, amount });
  await checkAndUpdateEnergyBlock(userId);
  return result;
}

/**
 * Recalcula o status de bloqueio de energia do usuário.
 * Delega 100% para `computeConsecutiveUnpaidMiningDays` (fonte única de verdade),
 * que considera um dia como quitado se houve charge pago/isento OU 10+ atividades
 * (bug B3). Bloqueia quando `willBlock` (>= 3 dias consecutivos devendo).
 */
export async function checkAndUpdateEnergyBlock(userId: number, now: Date = new Date()): Promise<boolean> {
  if (!isEnergyTaxActive(now)) return false;

  const { willBlock: shouldBlock, consecutiveUnpaid } = await computeConsecutiveUnpaidMiningDays(userId, now);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { energyBlocked: true } });
  if (!user) return false;

  if (shouldBlock !== user.energyBlocked) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        energyBlocked: shouldBlock,
        energyBlockedAt: shouldBlock ? new Date() : null,
      },
    });
    logger.info("energy block updated", { userId, energyBlocked: shouldBlock, consecutiveUnpaid });
  }
  return shouldBlock;
}

/**
 * Cron de fechamento — segunda 21h BRT. Para cada user que minerou nos últimos 7d,
 * cobra os dias que não tiveram pagamento manual usando AUTO_PER_DAY_RATE (2.1429%/dia).
 * Dias isentos por atividade (10+) recebem charge mode="exempt" em vez de débito (bug B6).
 *
 * Saldo insuficiente:
 *   - cobra o que tem → status="partial" (com nota)
 *   - se zero → status="skipped" (sem debitar nem criar Transaction)
 */
export async function runWeeklySweep(now: Date = new Date()) {
  if (!isEnergyTaxActive(now)) {
    logger.info("sweep skipped — feature not yet active", { startsAt: ENERGY_TAX_STARTS_AT });
    return { touched: 0, chargesCreated: 0 };
  }
  const days = lastSevenBrtDays(now);
  const windowStart = days[0];
  const windowEnd = nextMiningPeriodStart(days[6]);
  const todayStart = miningPeriodStart(now);
  const firstTaxable = firstTaxableBrtDayStart();

  // Quem minerou nos últimos 7d
  const minerRows = await prisma.blockMinerReward.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: windowStart, lt: windowEnd } },
    _sum: { rewardAmount: true },
  });
  logger.info("sweep starting", { users: minerRows.length, window: [windowStart, windowEnd] });

  let touched = 0;
  let chargesCreated = 0;

  for (const row of minerRows) {
    const userId = row.userId;
    const existing = await prisma.energyTaxCharge.findMany({
      where: { userId, periodDayStartsAt: { gte: windowStart, lt: windowEnd } },
      select: { periodDayStartsAt: true },
    });
    const paidDayKeys = new Set(existing.map((e) => e.periodDayStartsAt.getTime()));

    for (const dayStart of days) {
      if (dayStart.getTime() < firstTaxable.getTime()) continue;
      if (dayStart.getTime() >= todayStart.getTime()) continue;
      if (paidDayKeys.has(dayStart.getTime())) continue;
      const dayRewards = await rewardsForBrtDay(userId, dayStart);
      if (dayRewards <= 0) continue;

      // Isenção por atividade (bug B6): o sweep também deve respeitar a isenção,
      // não apenas o pagamento manual. Cria charge exempt sem debitar.
      const { exempt } = await countTodayActivities(userId, dayStart);
      if (exempt) {
        try {
          await prisma.energyTaxCharge.create({
            data: {
              userId,
              periodDayStartsAt: dayStart,
              mode: "exempt",
              rewardsBase: new Prisma.Decimal(dayRewards.toFixed(8)),
              ratePercent: new Prisma.Decimal("0"),
              amount: new Prisma.Decimal("0"),
              status: "paid",
              notes: "Isento: 10+ atividades (offerwall/faucet/shortlink/youtube/jogos) no dia",
            },
          });
          chargesCreated++;
          logger.info("sweep exempt day", { userId, dayStart });
        } catch (err) {
          logger.warn("sweep exempt charge failed", { userId, dayStart, err: (err as Error).message });
        }
        continue;
      }

      const amount = Number((dayRewards * AUTO_PER_DAY_RATE).toFixed(8));
      if (amount <= 0) continue;

      try {
        await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { id: userId }, select: { polBalance: true } });
          if (!user) return;
          const balance = Number(user.polBalance);

          let debit = amount;
          let status: "paid" | "partial" | "skipped" = "paid";
          let txId: number | null = null;
          let notes: string | null = null;

          if (balance <= 0) {
            status = "skipped";
            debit = 0;
            notes = "Saldo zero no momento da cobrança";
          } else if (balance < amount) {
            status = "partial";
            debit = balance;
            notes = `Saldo insuficiente: cobrado ${balance} de ${amount}`;
          }

          if (debit > 0) {
            const debitDec = new Prisma.Decimal(debit.toFixed(8));
            const transaction = await tx.transaction.create({
              data: {
                userId,
                type: "energy_tax",
                amount: debitDec,
                status: "completed",
                completedAt: new Date(),
              },
            });
            txId = transaction.id;
            await tx.user.update({
              where: { id: userId },
              data: { polBalance: { decrement: debitDec } },
            });
          }

          await tx.energyTaxCharge.create({
            data: {
              userId,
              periodDayStartsAt: dayStart,
              mode: "auto",
              rewardsBase: new Prisma.Decimal(dayRewards.toFixed(8)),
              ratePercent: new Prisma.Decimal((AUTO_PER_DAY_RATE * 100).toFixed(4)),
              amount: new Prisma.Decimal(debit.toFixed(8)),
              status,
              notes,
              transactionId: txId,
            },
          });
        });
        chargesCreated++;
      } catch (err) {
        logger.warn("sweep day charge failed", { userId, dayStart, err: (err as Error).message });
      }
    }
    await checkAndUpdateEnergyBlock(userId, now).catch(() => {});
    touched++;
  }

  logger.info("sweep finished", { touched, chargesCreated });
  return { touched, chargesCreated };
}
