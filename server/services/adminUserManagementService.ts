import type { Prisma, PrismaClient } from "@prisma/client";
import { excludeQaTestUsersWhere, isQaTestUserRecord } from "../utils/qaTestUser.js";
import { isInfrastructureIp, normalizeIp } from "../modules/ip-intelligence/ipAddress.js";
import { getCachedIpIntelligence } from "./ipIntelligenceService.js";

const MAX_SEARCH = 140;
const MAX_LIMIT = 100;
const SENSITIVE_KEY_RE = /password|hash|token|secret|cookie|authorization|private|mnemonic|seed|signature/i;

export type AdminQueryRecord = Record<string, unknown>;

export function parseAdminUserListQuery(query: AdminQueryRecord = {}) {
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit ?? query.pageSize, 25, MAX_LIMIT);
  const q = cleanSearch(query.q);
  const filter = cleanEnum(query.filter || "all", [
    "all", "active", "banned", "with_balance", "with_active_machines", "hashrate_positive",
    "wallet_linked", "wallet_missing", "with_deposits", "with_withdrawals", "with_faucet",
    "shared_ip", "suspected", "asn_provider", "today", "7d", "30d", "show_qa",
  ] as const, "all");
  const sort = cleanEnum(query.sort || "recent_id", [
    "recent_id", "oldest_id", "highest_balance", "highest_hashrate", "last_login",
    "created_recent", "transaction_count", "log_count", "risk",
  ] as const, "recent_id");
  return { page, limit, q, filter, sort };
}

function parsePositiveInt(value: unknown, fallback: number, max = MAX_LIMIT): number {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).trim();
  if (!/^\d{1,6}$/.test(s)) throw new Error("invalid_pagination");
  return Math.max(1, Math.min(max, Number(s)));
}

function cleanSearch(value: unknown): string {
  const s = String(value || "").trim();
  if (s.length > MAX_SEARCH) throw new Error("invalid_search");
  return s;
}

function cleanEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const s = String(value || "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function numericId(value: unknown): number | null {
  const s = String(value || "").trim().replace(/^#/, "");
  return /^\d{1,12}$/.test(s) ? Number(s) : null;
}

function isWalletLike(value: unknown): boolean {
  return /^0x[0-9a-fA-F]{6,64}$/.test(String(value || "").trim());
}

function isHashLike(value: unknown): boolean {
  return /^0x[0-9a-fA-F]{24,128}$/.test(String(value || "").trim());
}

function containsInsensitive(value: string): { contains: string; mode: "insensitive" } {
  return { contains: value, mode: "insensitive" };
}

type JsonSanitize = string | number | boolean | null | JsonSanitize[] | { [k: string]: JsonSanitize | null };

function safeJson(value: unknown, maxChars = 600): JsonSanitize | null {
  if (value == null) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return sanitizeObject(parsed, maxChars);
  } catch {
    return String(value).slice(0, maxChars);
  }
}

function sanitizeObject(value: unknown, maxChars = 600): JsonSanitize | null {
  if (value == null) return value as null;
  if (typeof value === "string") return value.slice(0, maxChars);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((x) => sanitizeObject(x, maxChars)) as JsonSanitize[];
  if (typeof value === "object") {
    const out: Record<string, JsonSanitize | null> = {};
    for (const [key, child] of Object.entries(value).slice(0, 40)) {
      if (SENSITIVE_KEY_RE.test(key)) continue;
      out[key] = sanitizeObject(child, maxChars);
    }
    return out;
  }
  return null;
}

type TxDtoRow = Prisma.TransactionGetPayload<{
  select: {
    id: true;
    type: true;
    amount: true;
    fee: true;
    status: true;
    txHash: true;
    fromAddress: true;
    address: true;
    rawTx: true;
    createdAt: true;
    completedAt: true;
  };
}>;

function txDto(tx: TxDtoRow) {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount == null ? null : Number(tx.amount),
    fee: tx.fee == null ? null : Number(tx.fee),
    status: tx.status,
    txHash: tx.txHash || null,
    fromAddress: tx.fromAddress || null,
    address: tx.address || null,
    toAddress: tx.address || null,
    chain: "polygon",
    provider: tx.rawTx ? "onchain" : null,
    metadata: safeJson(tx.rawTx, 500),
    createdAt: tx.createdAt,
    completedAt: tx.completedAt || null,
  };
}

type AuditLogRow = Prisma.AuditLogGetPayload<{
  select: {
    id: true;
    userId: true;
    action: true;
    label: true;
    description: true;
    source: true;
    severity: true;
    ip: true;
    userAgent: true;
    detailsJson: true;
    metadata: true;
    relatedEntityType: true;
    relatedEntityId: true;
    actorAdminId: true;
    createdAt: true;
  };
}>;

function auditLogDto(row: AuditLogRow) {
  const metadata = row.metadata ?? safeJson(row.detailsJson, 700);
  return {
    id: `audit_log:${row.id}`,
    rawId: row.id,
    userId: row.userId,
    action: row.action,
    eventType: row.action,
    label: row.label || row.action,
    description: row.description || null,
    source: row.source || inferSource(row.action),
    severity: row.severity || inferSeverity(row.action),
    ip: row.ip || null,
    userAgent: row.userAgent ? String(row.userAgent).slice(0, 180) : null,
    metadata: sanitizeObject(metadata, 700),
    relatedEntityType: row.relatedEntityType || null,
    relatedEntityId: row.relatedEntityId || null,
    actorAdminId: row.actorAdminId || null,
    createdAt: row.createdAt,
  };
}

type AuditEventRow = Prisma.AuditEventGetPayload<{
  select: {
    id: true;
    userId: true;
    eventType: true;
    status: true;
    severity: true;
    resultCode: true;
    payload: true;
    userAgent: true;
    txHash: true;
    createdAt: true;
    timestamp: true;
  };
}>;

function auditEventDto(row: AuditEventRow) {
  return {
    id: `audit_event:${row.id}`,
    rawId: row.id,
    userId: row.userId,
    action: row.eventType,
    eventType: row.eventType,
    label: row.resultCode || row.eventType,
    description: row.status || null,
    source: inferSource(row.eventType),
    severity: row.severity || inferSeverity(row.eventType),
    ip: null,
    userAgent: row.userAgent ? String(row.userAgent).slice(0, 180) : null,
    metadata: sanitizeObject(row.payload, 700),
    relatedEntityType: row.txHash ? "transaction" : null,
    relatedEntityId: row.txHash || null,
    actorAdminId: null,
    createdAt: row.createdAt || row.timestamp,
  };
}

function inferSource(action: unknown): string {
  const a = String(action || "").toLowerCase();
  if (a.includes("auth") || a.includes("login") || a.includes("register")) return "auth";
  if (a.includes("admin")) return "admin";
  if (a.includes("fraud")) return "fraud";
  if (a.includes("tx") || a.includes("deposit") || a.includes("withdraw")) return "transaction";
  if (a.includes("mining") || a.includes("miner") || a.includes("faucet")) return "mining";
  return "user";
}

function inferSeverity(action: unknown): string {
  const a = String(action || "").toLowerCase();
  if (a.includes("fail") || a.includes("ban") || a.includes("reject")) return "danger";
  if (a.includes("warn") || a.includes("pending") || a.includes("lockout")) return "warning";
  if (a.includes("success") || a.includes("completed") || a.includes("claim")) return "success";
  return "info";
}

type IdPick = { userId?: number | null; id?: number | null };

async function findCandidateUserIds(prisma: PrismaClient, q: string): Promise<number[]> {
  if (!q) return [];
  const id = numericId(q);
  const ip = normalizeIp(q);
  const lower = q.toLowerCase();
  const candidates = new Set<number>();
  if (id) candidates.add(id);

  const take = 120;
  const jobs: Array<Promise<IdPick[]>> = [
    prisma.transaction.findMany({
      where: {
        OR: [
          id ? { id } : undefined,
          { txHash: containsInsensitive(q) },
          { address: containsInsensitive(q) },
          { fromAddress: containsInsensitive(q) },
        ].filter(Boolean) as Prisma.TransactionWhereInput[],
      },
      select: { userId: true },
      take,
    }),
    prisma.depositTicket.findMany({
      where: { OR: [{ txHash: containsInsensitive(q) }, { walletAddress: containsInsensitive(q) }] },
      select: { userId: true },
      take,
    }).catch(() => [] as IdPick[]),
    prisma.auditLog.findMany({
      where: { OR: [{ ip: ip || q }, { action: containsInsensitive(q) }, { detailsJson: containsInsensitive(q) }] },
      select: { userId: true },
      take,
    }),
    prisma.polygonHdAddress.findMany({
      where: { address: containsInsensitive(q) },
      select: { userId: true },
      take,
    }).catch(() => [] as IdPick[]),
    prisma.payout.findMany({
      where: { txHash: containsInsensitive(q) },
      select: { userId: true },
      take,
    }).catch(() => [] as IdPick[]),
  ];
  if (lower.startsWith("as")) {
    jobs.push(
      prisma.ipIntelligenceCache
        .findMany({
          where: { OR: [{ asnOrg: containsInsensitive(q) }, { providerLabel: containsInsensitive(q) }, { providerType: containsInsensitive(q) }] },
          select: { ip: true },
          take: 40,
        })
        .then((ips: { ip: string }[]) =>
          prisma.user.findMany({
            where: { OR: ips.flatMap((x) => [{ ip: x.ip }, { registrationIp: x.ip }]) },
            select: { id: true },
            take,
          }),
        )
        .catch(() => [] as IdPick[]),
    );
  }
  const rows = (await Promise.all(jobs)).flat();
  for (const row of rows) {
    if (row?.userId) candidates.add(Number(row.userId));
    if (row?.id) candidates.add(Number(row.id));
  }
  return [...candidates].filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, 200);
}

function buildUserWhere(args: { q: string; filter: string; candidateIds: number[] }): Prisma.UserWhereInput {
  const { q, filter, candidateIds } = args;
  const where: Prisma.UserWhereInput = {};
  const and: Prisma.UserWhereInput[] = [];
  if (filter !== "show_qa") {
    and.push(excludeQaTestUsersWhere());
  }
  if (q) {
    const nid = numericId(q);
    const nip = normalizeIp(q);
    const or = [
      nid ? { id: nid } : undefined,
      candidateIds.length ? { id: { in: candidateIds } } : undefined,
      { email: containsInsensitive(q) },
      { username: containsInsensitive(q) },
      { name: containsInsensitive(q) },
      { refCode: containsInsensitive(q) },
      { walletAddress: containsInsensitive(q) },
      { registrationIp: nip || containsInsensitive(q) },
      { ip: nip || containsInsensitive(q) },
      isWalletLike(q) || isHashLike(q)
        ? {
            transactions: {
              some: {
                OR: [{ txHash: containsInsensitive(q) }, { address: containsInsensitive(q) }, { fromAddress: containsInsensitive(q) }],
              },
            },
          }
        : undefined,
    ].filter(Boolean) as Prisma.UserWhereInput[];
    and.push({ OR: or });
  }
  if (filter === "active") and.push({ isBanned: false });
  if (filter === "banned") and.push({ isBanned: true });
  if (filter === "with_balance") and.push({ polBalance: { gt: 0 } });
  if (filter === "wallet_linked") and.push({ walletAddress: { not: null } });
  if (filter === "wallet_missing") and.push({ walletAddress: null });
  if (filter === "with_deposits") and.push({ transactions: { some: { type: "deposit" } } });
  if (filter === "with_withdrawals") and.push({ transactions: { some: { type: "withdrawal" } } });
  if (filter === "with_faucet") and.push({ faucetClaims: { isNot: null } });
  if (filter === "with_active_machines" || filter === "hashrate_positive") and.push({ miners: { some: { isActive: true } } });
  if (filter === "today") and.push({ createdAt: { gte: startOfDay(new Date()) } });
  if (filter === "7d") and.push({ createdAt: { gte: new Date(Date.now() - 7 * 86400000) } });
  if (filter === "30d") and.push({ createdAt: { gte: new Date(Date.now() - 30 * 86400000) } });
  if (and.length) where.AND = and;
  return where;
}

function startOfDay(date: Date | string | number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function orderByFor(sort: string): Prisma.UserOrderByWithRelationInput {
  if (sort === "oldest_id") return { id: "asc" };
  if (sort === "highest_balance") return { polBalance: "desc" };
  if (sort === "last_login") return { lastLoginAt: "desc" };
  if (sort === "created_recent") return { createdAt: "desc" };
  return { id: "desc" };
}

type UserMinerHashGroup = {
  userId: number;
  _sum: { hashRate: Prisma.Decimal | number | null };
  _count: { _all: number };
};

type TxCountGroup = { userId: number; _count: { _all: number } };

type IpIntelValue = {
  normalizedIp: string;
  reverseDns: string | null;
  reverseDnsForwardConfirmed: boolean | null;
  asn: number | null;
  asnOrg: string | null;
  networkCidr: string | null;
  providerLabel: string | null;
  providerType: string | null;
  confidence: string | number | null;
  proxyDetected: boolean | null;
  proxyType: string | null;
  proxyRiskScore: number | null;
  proxyProvider: string | null;
  proxyCheckedAt: Date | null;
  checkedAt: Date | null;
};

type ListUserRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    name: true;
    username: true;
    email: true;
    createdAt: true;
    lastLoginAt: true;
    ip: true;
    registrationIp: true;
    isBanned: true;
    walletAddress: true;
    polBalance: true;
    refCode: true;
    _count: { select: { transactions: true; auditLogs: true; supportMessages: true } };
  };
}>;

type ListUserOut = {
  id: number;
  name: string | null;
  username: string | null;
  email: string;
  status: string;
  isBanned: boolean;
  polBalance: number;
  hashRate: number;
  baseHashRate: number;
  activeMachines: number;
  walletAddress: string | null;
  registrationIp: string | null;
  ip: string | null;
  lastIp: string | null;
  lastIpIntelligence: IpIntelValue | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  refCode: string | null;
  totalTransactions: number;
  totalLogs: number;
  totalTickets: number;
  indicators: {
    hasWallet: boolean;
    hasDeposit: boolean;
    hasWithdrawal: boolean;
    hasFaucetClaims: boolean;
    hasSharedIp: boolean;
    ipRiskIgnored: boolean;
    possibleMultiAccount: boolean;
    isBanned: boolean;
    isQaTestAccount: boolean;
  };
};

export async function listAdminUsers(prisma: PrismaClient, query: AdminQueryRecord) {
  const parsed = parseAdminUserListQuery(query);
  const candidateIds = await findCandidateUserIds(prisma, parsed.q);
  const where = buildUserWhere({ ...parsed, candidateIds });
  const skip = (parsed.page - 1) * parsed.limit;
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: orderByFor(parsed.sort),
      skip,
      take: parsed.limit,
      select: {
        id: true, name: true, username: true, email: true, createdAt: true, lastLoginAt: true,
        ip: true, registrationIp: true, isBanned: true, walletAddress: true, polBalance: true,
        refCode: true,
        _count: { select: { transactions: true, auditLogs: true, supportMessages: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const ids = rows.map((u) => u.id);
  const machineByUser = new Map<number, UserMinerHashGroup>();
  if (ids.length) {
    const machineAgg = await prisma.userMiner.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, isActive: true },
      _sum: { hashRate: true },
      _count: { _all: true }
    });
    for (const x of machineAgg) {
      machineByUser.set(x.userId, x);
    }
  }
  const [depositCounts, withdrawalCounts, faucetRows] = await Promise.all([
    ids.length
      ? prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: "deposit" }, _count: { _all: true } })
      : ([] as TxCountGroup[]),
    ids.length
      ? prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: "withdrawal" }, _count: { _all: true } })
      : ([] as TxCountGroup[]),
    ids.length ? prisma.faucetClaim.findMany({ where: { userId: { in: ids } }, select: { userId: true, totalClaims: true } }) : []
  ]);
  const deposits = new Map<number, number>();
  for (const x of depositCounts) deposits.set(x.userId, x._count._all);
  const withdrawals = new Map<number, number>();
  for (const x of withdrawalCounts) withdrawals.set(x.userId, x._count._all);
  const faucet = new Set(faucetRows.map((x) => x.userId));
  const ipCounts = await sharedIpCounts(prisma, rows);
  const ipIntel = await cachedIpIntelMap(prisma, rows.flatMap((u) => [u.ip, u.registrationIp]));

  let users: ListUserOut[] = rows.map((u: ListUserRow) => {
    const machine = machineByUser.get(u.id);
    const hasSharedIp = [u.ip, u.registrationIp].some(
      (lip) => lip && !isInfrastructureIp(lip) && (ipCounts.get(lip) || 0) > 1,
    );
    const lastIpIntel = u.ip ? ipIntel.get(normalizeIp(u.ip) || u.ip) || null : null;
    const ipRiskIgnored = Boolean(u.ip && isInfrastructureIp(u.ip));
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      status: u.isBanned ? "banned" : "active",
      isBanned: u.isBanned,
      polBalance: Number(u.polBalance || 0),
      hashRate: Number(machine?._sum?.hashRate || 0),
      baseHashRate: Number(machine?._sum?.hashRate || 0),
      activeMachines: Number(machine?._count?._all || 0),
      walletAddress: u.walletAddress,
      registrationIp: u.registrationIp,
      ip: u.ip,
      lastIp: u.ip,
      lastIpIntelligence: lastIpIntel,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      refCode: u.refCode,
      totalTransactions: u._count.transactions,
      totalLogs: u._count.auditLogs,
      totalTickets: u._count.supportMessages,
      indicators: {
        hasWallet: Boolean(u.walletAddress),
        hasDeposit: (deposits.get(u.id) || 0) > 0,
        hasWithdrawal: (withdrawals.get(u.id) || 0) > 0,
        hasFaucetClaims: faucet.has(u.id),
        hasSharedIp,
        ipRiskIgnored,
        possibleMultiAccount:
          !ipRiskIgnored &&
          (hasSharedIp || Boolean(u.walletAddress && candidateIds.includes(u.id) && isWalletLike(parsed.q))),
        isBanned: u.isBanned,
        isQaTestAccount: isQaTestUserRecord({ username: u.username, email: u.email }),
      },
    };
  });
  if (parsed.filter === "shared_ip") users = users.filter((u) => u.indicators.hasSharedIp);
  if (parsed.filter === "suspected") users = users.filter((u) => u.indicators.possibleMultiAccount);
  if (parsed.filter === "asn_provider") users = users.filter((u) => Boolean(u.lastIpIntelligence?.asn || u.lastIpIntelligence?.providerType));
  if (parsed.sort === "highest_hashrate") users.sort((a, b) => b.hashRate - a.hashRate);
  if (parsed.sort === "transaction_count") users.sort((a, b) => b.totalTransactions - a.totalTransactions);
  if (parsed.sort === "log_count") users.sort((a, b) => b.totalLogs - a.totalLogs);
  if (parsed.sort === "risk") users.sort((a, b) => Number(b.indicators.possibleMultiAccount) - Number(a.indicators.possibleMultiAccount));
  return { ok: true, ...parsed, users, total };
}

async function sharedIpCounts(prisma: PrismaClient, users: ListUserRow[]): Promise<Map<string, number>> {
  const ips = [...new Set(users.flatMap((u) => [u.ip, u.registrationIp]).filter((x): x is string => Boolean(x)))];
  const map = new Map<string, number>();
  await Promise.all(
    ips.map(async (ip) => {
      const count = await prisma.user.count({ where: { OR: [{ ip }, { registrationIp: ip }] } });
      map.set(ip, count);
    }),
  );
  return map;
}

function infrastructureIntelDisplay(ip: string): IpIntelValue {
  return {
    normalizedIp: ip,
    reverseDns: null,
    reverseDnsForwardConfirmed: null,
    asn: null,
    asnOrg: null,
    networkCidr: null,
    providerLabel: "infrastructure/proxy",
    providerType: "infrastructure",
    confidence: "high",
    proxyDetected: null,
    proxyType: null,
    proxyRiskScore: null,
    proxyProvider: null,
    proxyCheckedAt: null,
    checkedAt: null,
  };
}

async function cachedIpIntelMap(prisma: PrismaClient, ips: Array<string | null>): Promise<Map<string, IpIntelValue>> {
  const normalized = [...new Set(ips.map(normalizeIp).filter((x): x is string => Boolean(x)))];
  if (!normalized.length) return new Map();
  const publicIps = normalized.filter((ip) => !isInfrastructureIp(ip));
  const rows = publicIps.length
    ? await prisma.ipIntelligenceCache.findMany({ where: { ip: { in: publicIps } } }).catch(() => [])
    : [];
  const intelMap = new Map<string, IpIntelValue>();
  for (const ip of normalized) {
    if (isInfrastructureIp(ip)) {
      intelMap.set(ip, infrastructureIntelDisplay(ip));
      continue;
    }
  }
  for (const row of rows) {
    intelMap.set(row.ip, {
      normalizedIp: row.ip,
      reverseDns: row.reverseDns,
      reverseDnsForwardConfirmed: row.reverseDnsForwardConfirmed,
      asn: row.asn,
      asnOrg: row.asnOrg,
      networkCidr: row.networkCidr,
      providerLabel: row.providerLabel,
      providerType: row.providerType,
      confidence: row.confidence,
      proxyDetected: row.proxyDetected ?? null,
      proxyType: row.proxyType ?? null,
      proxyRiskScore: Number.isInteger(row.proxyRiskScore) ? row.proxyRiskScore : null,
      proxyProvider: row.proxyProvider ?? null,
      proxyCheckedAt: row.proxyCheckedAt ?? null,
      checkedAt: row.checkedAt,
    });
  }
  return intelMap;
}

export async function getAdminUserProfile(prisma: PrismaClient, userId: unknown) {
  const id = parseUserId(userId);
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, username: true, email: true, createdAt: true, lastLoginAt: true,
      ip: true, registrationIp: true, isBanned: true, walletAddress: true, polBalance: true,
      btcBalance: true, ethBalance: true, usdtBalance: true, usdcBalance: true, zerBalance: true,
      blkBalance: true, blkLocked: true, refCode: true, referredBy: true, oldBaseHashRate: true,
      polygonHdAddress: { select: { address: true, derivationIndex: true, createdAt: true } },
    },
  });
  if (!user) return null;
  const [
    activeMachines,
    hashAgg,
    faucet,
    txCount,
    logCount,
    ticketCount,
    depositAgg,
    withdrawalAgg,
    referrer,
    referredCount,
    lastIpIntelligence,
  ] = await Promise.all([
    prisma.userMiner.count({ where: { userId: id, isActive: true } }),
    prisma.userMiner.aggregate({ where: { userId: id, isActive: true }, _sum: { hashRate: true } }),
    prisma.faucetClaim.findUnique({ where: { userId: id } }).catch(() => null),
    prisma.transaction.count({ where: { userId: id } }),
    prisma.auditLog.count({ where: { userId: id } }),
    prisma.supportMessage.count({ where: { userId: id } }),
    prisma.transaction.aggregate({ where: { userId: id, type: "deposit", status: "completed" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId: id, type: "withdrawal", status: "completed" }, _sum: { amount: true } }),
    user.referredBy ? prisma.user.findUnique({ where: { id: user.referredBy }, select: { id: true, username: true, email: true } }) : null,
    prisma.referral.count({ where: { referrerId: id } }).catch(() => 0),
    user.ip ? getCachedIpIntelligence(prisma, user.ip).catch(() => null) : null,
  ]);
  return {
    ok: true,
    user: {
      ...user,
      polBalance: Number(user.polBalance || 0),
      blkBalance: Number(user.blkBalance || 0),
      blkLocked: Number(user.blkLocked || 0),
      lastIpIntelligence,
    },
    metrics: {
      activeMachines,
      realHashRate: Number(hashAgg._sum.hashRate || 0),
      faucetClaims: faucet?.totalClaims ?? 0,
      totalTransactions: txCount,
      totalLogs: logCount,
      totalTickets: ticketCount,
      totalDeposited: Number(depositAgg._sum.amount || 0),
      totalWithdrawn: Number(withdrawalAgg._sum.amount || 0),
      referredCount,
      referrer,
      riskSummary: "Use Relacionados/Fraude para confirmar sinais antes de agir.",
    },
  };
}

export async function listAdminUserTransactions(prisma: PrismaClient, userId: unknown, query: AdminQueryRecord = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 25, 100);
  const q = cleanSearch(query.q);
  const type = String(query.type || "all").trim();
  const status = String(query.status || "all").trim();
  const where: Prisma.TransactionWhereInput = { userId: id };
  const and: Prisma.TransactionWhereInput[] = [];
  if (type && type !== "all") and.push({ type });
  if (status && status !== "all") and.push({ status });
  if (q) {
    const txId = numericId(q);
    and.push({
      OR: [
        txId ? { id: txId } : undefined,
        { txHash: containsInsensitive(q) },
        { address: containsInsensitive(q) },
        { fromAddress: containsInsensitive(q) },
        { status: containsInsensitive(q) },
        { type: containsInsensitive(q) },
      ].filter(Boolean) as Prisma.TransactionWhereInput[],
    });
  }
  if (and.length) where.AND = and;
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, type: true, amount: true, fee: true, status: true, txHash: true,
        address: true, fromAddress: true, rawTx: true, createdAt: true, completedAt: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);
  return { ok: true, page, limit, total, transactions: rows.map(txDto) };
}

export async function listAdminUserLogs(prisma: PrismaClient, userId: unknown, query: AdminQueryRecord = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 30, 100);
  const q = cleanSearch(query.q);
  const source = String(query.source || "all").trim();
  const severity = String(query.severity || "all").trim();
  const where: Prisma.AuditLogWhereInput = { userId: id };
  const and: Prisma.AuditLogWhereInput[] = [];
  if (source !== "all") and.push({ source });
  if (severity !== "all") and.push({ severity });
  if (q)
    and.push({
      OR: [
        { action: containsInsensitive(q) },
        { label: containsInsensitive(q) },
        { description: containsInsensitive(q) },
        { ip: containsInsensitive(q) },
        { detailsJson: containsInsensitive(q) },
        { relatedEntityId: containsInsensitive(q) },
      ],
    });
  if (and.length) where.AND = and;
  const [auditRows, auditTotal, eventRows, eventTotal] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, userId: true, action: true, label: true, description: true, source: true, severity: true,
        ip: true, userAgent: true, detailsJson: true, metadata: true, relatedEntityType: true,
        relatedEntityId: true, actorAdminId: true, createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditEvent
      .findMany({
        where: {
          userId: id,
          ...(q ? { OR: [{ eventType: containsInsensitive(q) }, { resultCode: containsInsensitive(q) }, { txHash: containsInsensitive(q) }] } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.max(10, Math.floor(limit / 2)),
        select: {
          id: true, userId: true, eventType: true, status: true, severity: true, resultCode: true,
          payload: true, userAgent: true, txHash: true, createdAt: true, timestamp: true,
        },
      })
      .catch(() => [] as AuditEventRow[]),
    prisma.auditEvent.count({ where: { userId: id } }).catch(() => 0),
  ]);
  type MergedLog = ReturnType<typeof auditLogDto> | ReturnType<typeof auditEventDto>;
  const logs: MergedLog[] = [...auditRows.map(auditLogDto), ...eventRows.map(auditEventDto)]
    .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime())
    .slice(0, limit);
  return { ok: true, page, limit, total: auditTotal + eventTotal, logs };
}

export async function listAdminUserTickets(prisma: PrismaClient, userId: unknown, query: AdminQueryRecord = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 20, 100);
  const q = cleanSearch(query.q);
  const where: Prisma.SupportMessageWhereInput = { userId: id };
  if (q) where.OR = [{ subject: containsInsensitive(q) }, { message: containsInsensitive(q) }, { email: containsInsensitive(q) }];
  const [rows, total] = await Promise.all([
    prisma.supportMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, subject: true, message: true, isRead: true, isReplied: true, repliedAt: true, createdAt: true },
    }),
    prisma.supportMessage.count({ where }),
  ]);
  return { ok: true, page, limit, total, tickets: rows.map((t) => ({ ...t, message: String(t.message || "").slice(0, 300) })) };
}

export async function listAdminUserMachines(prisma: PrismaClient, userId: unknown, query: AdminQueryRecord = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 20, 100);
  const q = cleanSearch(query.q);
  const where: Prisma.UserMinerWhereInput = { userId: id };
  if (q) where.OR = [{ miner: { name: containsInsensitive(q) } }, { miner: { slug: containsInsensitive(q) } }];
  const [rows, total] = await Promise.all([
    prisma.userMiner.findMany({
      where,
      orderBy: { purchasedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, level: true, hashRate: true, slotIndex: true, slotSize: true, isActive: true, imageUrl: true, purchasedAt: true,
        miner: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.userMiner.count({ where }),
  ]);
  return { ok: true, page, limit, total, machines: rows.map((m) => ({ ...m, hashRate: Number(m.hashRate || 0) })) };
}

export async function listAdminUserRelated(prisma: PrismaClient, userId: unknown) {
  const id = parseUserId(userId);
  const user = await prisma.user.findUnique({ where: { id }, select: { ip: true, registrationIp: true, walletAddress: true, refCode: true } });
  if (!user) return null;
  const ipList = [...new Set([user.ip, user.registrationIp].filter((x): x is string => Boolean(x)))];
  const [sameIp, sameWallet, referrals] = await Promise.all([
    ipList.length
      ? prisma.user.findMany({
          where: { id: { not: id }, OR: ipList.flatMap((ip) => [{ ip }, { registrationIp: ip }]) },
          select: { id: true, username: true, email: true, ip: true, registrationIp: true, walletAddress: true, isBanned: true },
          take: 50,
        })
      : [],
    user.walletAddress
      ? prisma.user.findMany({
          where: { id: { not: id }, walletAddress: { equals: user.walletAddress, mode: "insensitive" } },
          select: { id: true, username: true, email: true, ip: true, registrationIp: true, walletAddress: true, isBanned: true },
          take: 50,
        })
      : [],
    prisma.referral
      .findMany({
        where: { OR: [{ referrerId: id }, { referredId: id }] },
        select: {
          id: true, referrerId: true, referredId: true, createdAt: true,
          referrer: { select: { id: true, username: true, email: true } },
          referred: { select: { id: true, username: true, email: true } },
        },
        take: 50,
      })
      .catch(() => []),
  ]);
  return { ok: true, sameIp, sameWallet, referrals };
}

export async function setAdminUserBanState(
  prisma: PrismaClient,
  userId: unknown,
  opts: { isBanned: unknown; reason: unknown; actorAdminId?: number | null },
) {
  const { isBanned, reason, actorAdminId = null } = opts;
  const id = parseUserId(userId);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason || cleanReason.length > 500) throw new Error("invalid_reason");
  const user = await prisma.user.update({
    where: { id },
    data: { isBanned: Boolean(isBanned) },
    select: { id: true, username: true, email: true, isBanned: true },
  });
  await prisma.auditLog.create({
    data: {
      userId: id,
      action: user.isBanned ? "ADMIN_USER_BAN" : "ADMIN_USER_UNBAN",
      label: user.isBanned ? "User banned" : "User unbanned",
      description: cleanReason,
      source: "admin",
      severity: user.isBanned ? "danger" : "success",
      metadata: { reason: cleanReason },
      relatedEntityType: "user",
      relatedEntityId: String(id),
      actorAdminId,
    },
  });
  return { ok: true, user };
}

function parseUserId(value: unknown): number {
  const id = numericId(value);
  if (!id || !Number.isSafeInteger(id) || id < 1) throw new Error("invalid_user_id");
  return id;
}
