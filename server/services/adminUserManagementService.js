import { normalizeIp } from "../utils/clientIp.js";
import { getCachedIpIntelligence } from "./ipIntelligenceService.js";

const MAX_SEARCH = 140;
const MAX_LIMIT = 100;
const SENSITIVE_KEY_RE = /password|hash|token|secret|cookie|authorization|private|mnemonic|seed|signature/i;

export function parseAdminUserListQuery(query = {}) {
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit ?? query.pageSize, 25, MAX_LIMIT);
  const q = cleanSearch(query.q);
  const filter = cleanEnum(query.filter || "all", [
    "all", "active", "banned", "with_balance", "with_active_machines", "hashrate_positive",
    "wallet_linked", "wallet_missing", "with_deposits", "with_withdrawals", "with_faucet",
    "shared_ip", "suspected", "asn_provider", "today", "7d", "30d",
  ], "all");
  const sort = cleanEnum(query.sort || "recent_id", [
    "recent_id", "oldest_id", "highest_balance", "highest_hashrate", "last_login",
    "created_recent", "transaction_count", "log_count", "risk",
  ], "recent_id");
  return { page, limit, q, filter, sort };
}

function parsePositiveInt(value, fallback, max = MAX_LIMIT) {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).trim();
  if (!/^\d{1,6}$/.test(s)) throw new Error("invalid_pagination");
  return Math.max(1, Math.min(max, Number(s)));
}

function cleanSearch(value) {
  const s = String(value || "").trim();
  if (s.length > MAX_SEARCH) throw new Error("invalid_search");
  return s;
}

function cleanEnum(value, allowed, fallback) {
  const s = String(value || "").trim().toLowerCase();
  return allowed.includes(s) ? s : fallback;
}

function numericId(value) {
  const s = String(value || "").trim().replace(/^#/, "");
  return /^\d{1,12}$/.test(s) ? Number(s) : null;
}

function isWalletLike(value) {
  return /^0x[0-9a-fA-F]{6,64}$/.test(String(value || "").trim());
}

function isHashLike(value) {
  return /^0x[0-9a-fA-F]{24,128}$/.test(String(value || "").trim());
}

function containsInsensitive(value) {
  return { contains: value, mode: "insensitive" };
}

function safeJson(value, maxChars = 600) {
  if (value == null) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return sanitizeObject(parsed, maxChars);
  } catch {
    return String(value).slice(0, maxChars);
  }
}

function sanitizeObject(value, maxChars = 600) {
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, maxChars);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((x) => sanitizeObject(x, maxChars));
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value).slice(0, 40)) {
      if (SENSITIVE_KEY_RE.test(key)) continue;
      out[key] = sanitizeObject(child, maxChars);
    }
    return out;
  }
  return null;
}

function txDto(tx) {
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

function auditLogDto(row) {
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

function auditEventDto(row) {
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

function inferSource(action) {
  const a = String(action || "").toLowerCase();
  if (a.includes("auth") || a.includes("login") || a.includes("register")) return "auth";
  if (a.includes("admin")) return "admin";
  if (a.includes("fraud")) return "fraud";
  if (a.includes("tx") || a.includes("deposit") || a.includes("withdraw")) return "transaction";
  if (a.includes("mining") || a.includes("miner") || a.includes("faucet")) return "mining";
  return "user";
}

function inferSeverity(action) {
  const a = String(action || "").toLowerCase();
  if (a.includes("fail") || a.includes("ban") || a.includes("reject")) return "danger";
  if (a.includes("warn") || a.includes("pending") || a.includes("lockout")) return "warning";
  if (a.includes("success") || a.includes("completed") || a.includes("claim")) return "success";
  return "info";
}

async function findCandidateUserIds(prisma, q) {
  if (!q) return [];
  const id = numericId(q);
  const ip = normalizeIp(q);
  const lower = q.toLowerCase();
  const candidates = new Set();
  if (id) candidates.add(id);

  const take = 120;
  const jobs = [
    prisma.transaction.findMany({
      where: {
        OR: [
          id ? { id } : undefined,
          { txHash: containsInsensitive(q) },
          { address: containsInsensitive(q) },
          { fromAddress: containsInsensitive(q) },
        ].filter(Boolean),
      },
      select: { userId: true },
      take,
    }),
    prisma.depositTicket.findMany({
      where: { OR: [{ txHash: containsInsensitive(q) }, { walletAddress: containsInsensitive(q) }] },
      select: { userId: true },
      take,
    }).catch(() => []),
    prisma.auditLog.findMany({
      where: { OR: [{ ip: ip || q }, { action: containsInsensitive(q) }, { detailsJson: containsInsensitive(q) }] },
      select: { userId: true },
      take,
    }),
    prisma.polygonHdAddress.findMany({
      where: { address: containsInsensitive(q) },
      select: { userId: true },
      take,
    }).catch(() => []),
    prisma.payout.findMany({
      where: { txHash: containsInsensitive(q) },
      select: { userId: true },
      take,
    }).catch(() => []),
  ];
  if (lower.startsWith("as")) {
    jobs.push(
      prisma.ipIntelligenceCache.findMany({
        where: { OR: [{ asnOrg: containsInsensitive(q) }, { providerLabel: containsInsensitive(q) }, { providerType: containsInsensitive(q) }] },
        select: { ip: true },
        take: 40,
      }).then((ips) => prisma.user.findMany({
        where: { OR: ips.flatMap((x) => [{ ip: x.ip }, { registrationIp: x.ip }]) },
        select: { id: true },
        take,
      })).catch(() => []),
    );
  }
  const rows = (await Promise.all(jobs)).flat();
  for (const row of rows) {
    if (row?.userId) candidates.add(Number(row.userId));
    if (row?.id) candidates.add(Number(row.id));
  }
  return [...candidates].filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, 200);
}

function buildUserWhere({ q, filter, candidateIds }) {
  const where = {};
  const and = [];
  if (q) {
    const id = numericId(q);
    const ip = normalizeIp(q);
    const or = [
      id ? { id } : undefined,
      candidateIds.length ? { id: { in: candidateIds } } : undefined,
      { email: containsInsensitive(q) },
      { username: containsInsensitive(q) },
      { name: containsInsensitive(q) },
      { refCode: containsInsensitive(q) },
      { walletAddress: containsInsensitive(q) },
      { registrationIp: ip || containsInsensitive(q) },
      { ip: ip || containsInsensitive(q) },
      isWalletLike(q) || isHashLike(q) ? { transactions: { some: { OR: [{ txHash: containsInsensitive(q) }, { address: containsInsensitive(q) }, { fromAddress: containsInsensitive(q) }] } } } : undefined,
    ].filter(Boolean);
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

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function orderByFor(sort) {
  if (sort === "oldest_id") return { id: "asc" };
  if (sort === "highest_balance") return { polBalance: "desc" };
  if (sort === "last_login") return { lastLoginAt: "desc" };
  if (sort === "created_recent") return { createdAt: "desc" };
  return { id: "desc" };
}

export async function listAdminUsers(prisma, query) {
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
  const [machineAgg, depositCounts, withdrawalCounts, faucetRows] = await Promise.all([
    ids.length ? prisma.userMiner.groupBy({ by: ["userId"], where: { userId: { in: ids }, isActive: true }, _sum: { hashRate: true }, _count: { _all: true } }) : [],
    ids.length ? prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: "deposit" }, _count: { _all: true } }) : [],
    ids.length ? prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: "withdrawal" }, _count: { _all: true } }) : [],
    ids.length ? prisma.faucetClaim.findMany({ where: { userId: { in: ids } }, select: { userId: true, totalClaims: true } }) : [],
  ]);
  const machineByUser = new Map(machineAgg.map((x) => [x.userId, x]));
  const deposits = new Map(depositCounts.map((x) => [x.userId, x._count._all]));
  const withdrawals = new Map(withdrawalCounts.map((x) => [x.userId, x._count._all]));
  const faucet = new Set(faucetRows.map((x) => x.userId));
  const ipCounts = await sharedIpCounts(prisma, rows);
  const ipIntel = await cachedIpIntelMap(prisma, rows.flatMap((u) => [u.ip, u.registrationIp]));

  let users = rows.map((u) => {
    const machine = machineByUser.get(u.id);
    const hasSharedIp = [u.ip, u.registrationIp].some((ip) => ip && (ipCounts.get(ip) || 0) > 1);
    const lastIpIntel = u.ip ? ipIntel.get(u.ip) || null : null;
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
        possibleMultiAccount: hasSharedIp || Boolean(u.walletAddress && candidateIds.includes(u.id) && isWalletLike(parsed.q)),
        isBanned: u.isBanned,
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

async function sharedIpCounts(prisma, users) {
  const ips = [...new Set(users.flatMap((u) => [u.ip, u.registrationIp]).filter(Boolean))];
  const map = new Map();
  await Promise.all(ips.map(async (ip) => {
    const count = await prisma.user.count({ where: { OR: [{ ip }, { registrationIp: ip }] } });
    map.set(ip, count);
  }));
  return map;
}

async function cachedIpIntelMap(prisma, ips) {
  const normalized = [...new Set(ips.map(normalizeIp).filter(Boolean))];
  if (!normalized.length) return new Map();
  const rows = await prisma.ipIntelligenceCache.findMany({ where: { ip: { in: normalized } } }).catch(() => []);
  return new Map(rows.map((row) => [row.ip, {
    normalizedIp: row.ip,
    reverseDns: row.reverseDns,
    reverseDnsForwardConfirmed: row.reverseDnsForwardConfirmed,
    asn: row.asn,
    asnOrg: row.asnOrg,
    networkCidr: row.networkCidr,
    providerLabel: row.providerLabel,
    providerType: row.providerType,
    confidence: row.confidence,
    checkedAt: row.checkedAt,
  }]));
}

export async function getAdminUserProfile(prisma, userId) {
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

export async function listAdminUserTransactions(prisma, userId, query = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 25, 100);
  const q = cleanSearch(query.q);
  const type = String(query.type || "all").trim();
  const status = String(query.status || "all").trim();
  const where = { userId: id };
  const and = [];
  if (type && type !== "all") and.push({ type });
  if (status && status !== "all") and.push({ status });
  if (q) {
    const txId = numericId(q);
    and.push({ OR: [
      txId ? { id: txId } : undefined,
      { txHash: containsInsensitive(q) },
      { address: containsInsensitive(q) },
      { fromAddress: containsInsensitive(q) },
      { status: containsInsensitive(q) },
      { type: containsInsensitive(q) },
    ].filter(Boolean) });
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

export async function listAdminUserLogs(prisma, userId, query = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 30, 100);
  const q = cleanSearch(query.q);
  const source = String(query.source || "all").trim();
  const severity = String(query.severity || "all").trim();
  const where = { userId: id };
  const and = [];
  if (source !== "all") and.push({ source });
  if (severity !== "all") and.push({ severity });
  if (q) and.push({ OR: [
    { action: containsInsensitive(q) },
    { label: containsInsensitive(q) },
    { description: containsInsensitive(q) },
    { ip: containsInsensitive(q) },
    { detailsJson: containsInsensitive(q) },
    { relatedEntityId: containsInsensitive(q) },
  ] });
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
    prisma.auditEvent.findMany({
      where: { userId: id, ...(q ? { OR: [{ eventType: containsInsensitive(q) }, { resultCode: containsInsensitive(q) }, { txHash: containsInsensitive(q) }] } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.max(10, Math.floor(limit / 2)),
      select: {
        id: true, userId: true, eventType: true, status: true, severity: true, resultCode: true,
        payload: true, userAgent: true, txHash: true, createdAt: true, timestamp: true,
      },
    }).catch(() => []),
    prisma.auditEvent.count({ where: { userId: id } }).catch(() => 0),
  ]);
  const logs = [...auditRows.map(auditLogDto), ...eventRows.map(auditEventDto)]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
  return { ok: true, page, limit, total: auditTotal + eventTotal, logs };
}

export async function listAdminUserTickets(prisma, userId, query = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 20, 100);
  const q = cleanSearch(query.q);
  const where = { userId: id };
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

export async function listAdminUserMachines(prisma, userId, query = {}) {
  const id = parseUserId(userId);
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 20, 100);
  const q = cleanSearch(query.q);
  const where = { userId: id };
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

export async function listAdminUserRelated(prisma, userId) {
  const id = parseUserId(userId);
  const user = await prisma.user.findUnique({ where: { id }, select: { ip: true, registrationIp: true, walletAddress: true, refCode: true } });
  if (!user) return null;
  const ipList = [...new Set([user.ip, user.registrationIp].filter(Boolean))];
  const [sameIp, sameWallet, referrals] = await Promise.all([
    ipList.length ? prisma.user.findMany({
      where: { id: { not: id }, OR: ipList.flatMap((ip) => [{ ip }, { registrationIp: ip }]) },
      select: { id: true, username: true, email: true, ip: true, registrationIp: true, walletAddress: true, isBanned: true },
      take: 50,
    }) : [],
    user.walletAddress ? prisma.user.findMany({
      where: { id: { not: id }, walletAddress: { equals: user.walletAddress, mode: "insensitive" } },
      select: { id: true, username: true, email: true, ip: true, registrationIp: true, walletAddress: true, isBanned: true },
      take: 50,
    }) : [],
    prisma.referral.findMany({
      where: { OR: [{ referrerId: id }, { referredId: id }] },
      select: {
        id: true, referrerId: true, referredId: true, createdAt: true,
        referrer: { select: { id: true, username: true, email: true } },
        referred: { select: { id: true, username: true, email: true } },
      },
      take: 50,
    }).catch(() => []),
  ]);
  return { ok: true, sameIp, sameWallet, referrals };
}

export async function setAdminUserBanState(prisma, userId, { isBanned, reason, actorAdminId = null }) {
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

function parseUserId(value) {
  const id = numericId(value);
  if (!id || !Number.isSafeInteger(id) || id < 1) throw new Error("invalid_user_id");
  return id;
}
