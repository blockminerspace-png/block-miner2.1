const BRT = "America/Sao_Paulo";

export type SanitizedDateRange = {
  from: Date;
  to: Date;
  serverNow: string;
  serverNowBrt: string;
};

export type SanitizeDateRangeResult =
  | { ok: true; range: SanitizedDateRange }
  | { ok: false; message: string };

function parseIsoDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatBrtNow(now: Date): string {
  return now.toLocaleString("pt-BR", {
    timeZone: BRT,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Sanitize admin analytics date range query params.
 * Defaults to last 7 days ending at server now.
 */
export function sanitizeAdminDateRange(
  fromRaw: unknown,
  toRaw: unknown,
  opts?: { maxRangeDays?: number; defaultRangeDays?: number },
): SanitizeDateRangeResult {
  const maxRangeDays = opts?.maxRangeDays ?? 90;
  const defaultRangeDays = opts?.defaultRangeDays ?? 7;
  const now = new Date();

  let to = parseIsoDate(toRaw) ?? now;
  if (to.getTime() > now.getTime()) to = now;

  let from = parseIsoDate(fromRaw);
  if (!from) {
    from = new Date(to);
    from.setDate(from.getDate() - (defaultRangeDays - 1));
    from.setUTCHours(0, 0, 0, 0);
  }

  if (from.getTime() > to.getTime()) {
    return { ok: false, message: "from must be before or equal to to" };
  }

  const maxMs = maxRangeDays * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    return { ok: false, message: `Date range exceeds ${maxRangeDays} days maximum` };
  }

  return {
    ok: true,
    range: {
      from,
      to,
      serverNow: now.toISOString(),
      serverNowBrt: formatBrtNow(now),
    },
  };
}

export function parseOptionalUserId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}
