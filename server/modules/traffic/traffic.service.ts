import _prisma from "../../src/db/prisma.js";
const prisma = _prisma as any;

export async function recordPageView(data: {
  path: string;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}): Promise<void> {
  await prisma.pageView.create({ data });
}

export async function getTrafficSummary(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [totalHits, periodHits, totalRegs, periodRegs] = await Promise.all([
    prisma.pageView.count(),
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
  ]);

  return {
    totalHits,
    periodHits,
    totalRegs,
    periodRegs,
    conversionRate: periodHits > 0 ? (periodRegs / periodHits) * 100 : 0,
    days,
  };
}

export async function getTrafficByDomain(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [hits, regs] = await Promise.all([
    prisma.pageView.groupBy({
      by: ["referrerDomain"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
    prisma.user.groupBy({
      by: ["referrerDomain"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  const regMap = new Map<string, number>();
  for (const r of regs) {
    regMap.set(r.referrerDomain ?? "direct", r._count.id);
  }

  return hits.map((h: any) => {
    const domain = h.referrerDomain ?? "direct";
    const hitsCount = h._count.id;
    const regCount = regMap.get(domain) ?? 0;
    return {
      domain,
      hits: hitsCount,
      registrations: regCount,
      conversionRate: hitsCount > 0 ? (regCount / hitsCount) * 100 : 0,
    };
  });
}

export async function getTrafficByUtm(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [hits, regs] = await Promise.all([
    prisma.pageView.groupBy({
      by: ["utmSource"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
    prisma.user.groupBy({
      by: ["utmSource"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  const regMap = new Map<string, number>();
  for (const r of regs) {
    regMap.set(r.utmSource ?? "(none)", r._count.id);
  }

  return hits.map((h: any) => {
    const source = h.utmSource ?? "(none)";
    const hitsCount = h._count.id;
    const regCount = regMap.get(source) ?? 0;
    return {
      source,
      hits: hitsCount,
      registrations: regCount,
      conversionRate: hitsCount > 0 ? (regCount / hitsCount) * 100 : 0,
    };
  });
}

export async function getTrafficDaily(days = 30) {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       TO_CHAR(d.day::date, 'YYYY-MM-DD') AS date,
       COALESCE(h.hits, 0)::text           AS hits,
       COALESCE(r.regs, 0)::text           AS registrations
     FROM generate_series(
       (NOW() - INTERVAL '${days} days')::date,
       NOW()::date,
       '1 day'::interval
     ) AS d(day)
     LEFT JOIN (
       SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS hits
       FROM page_views
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY 1
     ) h ON h.day = d.day::date
     LEFT JOIN (
       SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS regs
       FROM users
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY 1
     ) r ON r.day = d.day::date
     ORDER BY d.day`
  )) as Array<{ date: string; hits: string; registrations: string }>;
  return rows.map((r) => ({
    date: r.date,
    hits: Number(r.hits),
    registrations: Number(r.registrations),
  }));
}
