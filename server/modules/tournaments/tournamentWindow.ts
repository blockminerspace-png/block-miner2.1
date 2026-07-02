import { utcDayStart } from "../zerads/zeradsClickLimits.js";

const MS_DAY = 24 * 60 * 60 * 1000;

/** Segunda-feira 00:00 UTC da semana que contém `instant`. */
export function utcWeekStart(instant: Date): Date {
  const day0 = utcDayStart(instant);
  const dow = day0.getUTCDay(); // 0=dom … 6=sáb
  const daysSinceMonday = (dow + 6) % 7;
  return new Date(day0.getTime() - daysSinceMonday * MS_DAY);
}

/** Dia 1 00:00 UTC do mês que contém `instant`. */
export function utcMonthStart(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
}

export function utcMonthEnd(monthStart: Date): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
}

/**
 * Janela canônica em UTC (horário do servidor):
 *  - DAILY:   00:00 UTC → +24h
 *  - WEEKLY:  segunda 00:00 UTC → +7d
 *  - MONTHLY: dia 1 00:00 UTC → dia 1 do mês seguinte
 */
export function snapWindowForType(
  type: string | undefined,
  anchor: Date,
): { start: Date; end: Date } | null {
  if (type === "DAILY") {
    const start = utcDayStart(anchor);
    return { start, end: new Date(start.getTime() + MS_DAY) };
  }
  if (type === "WEEKLY") {
    const start = utcWeekStart(anchor);
    return { start, end: new Date(start.getTime() + 7 * MS_DAY) };
  }
  if (type === "MONTHLY") {
    const start = utcMonthStart(anchor);
    return { start, end: utcMonthEnd(start) };
  }
  return null;
}

/** Alinha torneio ACTIVE à janela UTC do ciclo corrente. */
export function snapWindowForActiveTournament(
  type: string,
  startsAt: Date,
  _endsAt: Date,
  now = new Date(),
): { start: Date; end: Date } | null {
  if (type === "DAILY") return snapWindowForType("DAILY", now);
  return snapWindowForType(type, startsAt);
}
