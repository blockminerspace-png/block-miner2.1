import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("EnergyTax");

const TZ = "America/Sao_Paulo";

/** Rate constants — see TaxesPage spec. */
export const FULL_WEEK_RATE = 0.10;   // 10% — cobrança automática segunda 21h
export const DAILY_WEEK_RATE = 0.075; // 7.5% — paga 1× por dia (7 dias seguidos)
export const DAILY_PER_DAY_RATE = DAILY_WEEK_RATE / 7; // 1.0714% por dia
export const AUTO_PER_DAY_RATE  = FULL_WEEK_RATE  / 7; // 1.4286% por dia

/**
 * Feature flag temporal — a taxa de energia só passa a valer 01/07/2026 00:00 BRT.
 * Antes desse instante: nenhuma cobrança (manual ou cron) é permitida.
 * Pode ser ajustado via env `ENERGY_TAX_STARTS_AT_ISO` (formato UTC ISO).
 */
const DEFAULT_STARTS_AT_ISO = "2026-07-01T03:00:00.000Z"; // 00:00 BRT
export const ENERGY_TAX_STARTS_AT = new Date(
  process.env.ENERGY_TAX_STARTS_AT_ISO || DEFAULT_STARTS_AT_ISO,
);

export function isEnergyTaxActive(now: Date = new Date()): boolean {
  return now.getTime() >= ENERGY_TAX_STARTS_AT.getTime();
}

/**
 * 00:00 BRT do dia da `date` informada. Resultado é um Date UTC apontando para
 * o exato instante de meia-noite em São Paulo. Independente de DST/horário de verão.
 */
export function brtDayStart(date: Date = new Date()): Date {
  // Format "YYYY-MM-DD" como BRT a partir do instante UTC.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;

  // Descobre o offset BRT atual com o truque "do reverso":
  // pega meia-noite UTC e descobre que horas é em SP, ajusta.
  // Mais simples: BRT é UTC-3 (sem DST atualmente no Brasil desde 2019).
  // Se um dia voltar DST, dá pra usar a lib `luxon`. Por ora hardcoded.
  return new Date(`${ymd}T03:00:00.000Z`); // 00:00 BRT = 03:00 UTC
}

/** Próximo "dia BRT" depois de `dayStart` (24h adiante). */
function nextBrtDay(dayStart: Date): Date {
  return new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
}

/** Lista os 7 dias BRT que precedem `now` (incluindo o dia atual). Ordem: mais antigo → mais novo. */
export function lastSevenBrtDays(now: Date = new Date()): Date[] {
  const today = brtDayStart(now);
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
  }
  return days;
}

/** Soma de POL minerado num intervalo (BlockMinerReward.rewardAmount). */
async function sumRewardsBetween(userId: number, fromInclusive: Date, toExclusive: Date): Promise<number> {
  const agg = await prisma.blockMinerReward.aggregate({
    where: { userId, createdAt: { gte: fromInclusive, lt: toExclusive } },
    _sum: { rewardAmount: true },
  });
  return Number(agg._sum.rewardAmount ?? 0);
}

export async function rewardsForBrtDay(userId: number, dayStart: Date): Promise<number> {
  return sumRewardsBetween(userId, dayStart, nextBrtDay(dayStart));
}

export type EnergyTaxSummary = {
  startsAt: string;       // ISO — feature gating; antes desse instante UI deve mostrar "começa em X"
  active: boolean;        // true se now >= startsAt
  weekStart: string;      // ISO
  weekEnd: string;        // ISO
  totalRewards7d: number;
  fullRateTax: number;    // 10% × total
  dailyRateTax: number;   // 7.5% × total
  paidPol: number;        // já debitado (sum de charges existentes)
  paidDays: number;       // contagem de dias com charge
  unpaidDays: number;
  todayPaid: boolean;
  todayRewards: number;
  todayDailyCharge: number; // valor que seria debitado ao clicar "Pagar hoje" agora
  days: Array<{
    dayStart: string;
    rewards: number;
    charge: { id: number; mode: string; amount: number; ratePercent: number; status: string; createdAt: string } | null;
  }>;
  history: Array<{ id: number; mode: string; amount: number; ratePercent: number; rewardsBase: number; status: string; periodDayStartsAt: string; createdAt: string }>;
};

export async function computeWeekSummary(userId: number, now: Date = new Date()): Promise<EnergyTaxSummary> {
  const days = lastSevenBrtDays(now);
  const weekStart = days[0];
  const weekEnd = nextBrtDay(days[6]);

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
  for (let i = 0; i < days.length; i++) {
    totalRewards7d += rewardsByDay[i];
    const c = chargeByDay.get(days[i].getTime());
    if (c) {
      paidPol += Number(c.amount);
      paidDays += 1;
    }
  }
  const unpaidDays = 7 - paidDays;

  const today = days[6];
  const todayCharge = chargeByDay.get(today.getTime()) ?? null;
  const todayRewards = rewardsByDay[6];
  const todayDailyCharge = Number((todayRewards * DAILY_PER_DAY_RATE).toFixed(8));

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
    unpaidDays,
    todayPaid: !!todayCharge,
    todayRewards,
    todayDailyCharge,
    days: days.map((d, i) => {
      const c = chargeByDay.get(d.getTime());
      return {
        dayStart: d.toISOString(),
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
  constructor() { super("Você já pagou a taxa de energia de hoje."); this.name = "EnergyTaxAlreadyPaid"; }
}
export class EnergyTaxNoRewards extends Error {
  constructor() { super("Você não minerou nada hoje — sem taxa pra cobrar."); this.name = "EnergyTaxNoRewards"; }
}
export class EnergyTaxInsufficientBalance extends Error {
  constructor(public required: number, public available: number) {
    super(`Saldo insuficiente: precisa de ${required} POL, tem ${available} POL.`);
    this.name = "EnergyTaxInsufficientBalance";
  }
}

/**
 * Pagamento manual diário. Idempotente: 1 charge por (userId, hoje-BRT).
 * Debita do polBalance, cria Transaction(type="energy_tax") + EnergyTaxCharge linkada.
 */
export async function payDailyTax(userId: number, now: Date = new Date()) {
  if (!isEnergyTaxActive(now)) throw new EnergyTaxNotStarted(ENERGY_TAX_STARTS_AT);
  const dayStart = brtDayStart(now);

  const existing = await prisma.energyTaxCharge.findUnique({
    where: { userId_periodDayStartsAt: { userId, periodDayStartsAt: dayStart } },
  });
  if (existing) throw new EnergyTaxAlreadyPaid();

  const rewards = await rewardsForBrtDay(userId, dayStart);
  if (rewards <= 0) throw new EnergyTaxNoRewards();

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
        periodDayStartsAt: dayStart,
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

  logger.info("daily charge created", { userId, dayStart, amount });
  return result;
}

/**
 * Cron de fechamento — segunda 21h BRT. Para cada user que minerou nos últimos 7d,
 * cobra os dias que não tiveram pagamento manual usando AUTO_PER_DAY_RATE (1.43%/dia).
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
  const windowEnd = nextBrtDay(days[6]);

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
      if (paidDayKeys.has(dayStart.getTime())) continue;
      const dayRewards = await rewardsForBrtDay(userId, dayStart);
      if (dayRewards <= 0) continue;
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
    touched++;
  }

  logger.info("sweep finished", { touched, chargesCreated });
  return { touched, chargesCreated };
}
