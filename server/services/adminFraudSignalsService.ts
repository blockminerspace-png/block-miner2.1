import { Prisma, type PrismaClient } from "@prisma/client";
import { deriveDefaultNetworkCidr, normalizeIp } from "../utils/clientIp.js";
import { getCachedIpIntelligence } from "./ipIntelligenceService.js";
import { calculateMultiAccountRisk } from "./multiAccountRiskService.js";

type FraudUserRecord = {
  id: number;
  username: string | null;
  email: string;
  walletAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
};

type ClusterInput = {
  kind: string;
  signalType: string;
  key: string;
  users: FraudUserRecord[];
  ipIntelligence?: Record<string, unknown> | null;
};

type ListAdminFraudSignalsOpts = {
  scope?: unknown;
  q?: unknown;
  page?: unknown;
  limit?: unknown;
  maxClusters?: unknown;
};

const ALLOWED_SCOPES = new Set([
  "all",
  "wallets",
  "ips",
  "devices",
  "chain",
  "ip_exact",
  "ip_network",
  "asn",
  "high_risk",
  "low_confidence",
  "false_positive",
  "shared_residential",
]);
const DERIVED_IP_SCAN_LIMIT = 1500;

function parsePage(value) {
  if (value === undefined || value === null || value === "") return 1;
  const s = String(value).trim();
  if (!/^\d{1,5}$/.test(s)) throw new Error("invalid_page");
  return Math.max(1, Number(s));
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 40;
  const s = String(value).trim();
  if (!/^\d{1,3}$/.test(s)) throw new Error("invalid_limit");
  return Math.max(1, Math.min(100, Number(s)));
}

function cleanQuery(value) {
  return String(value || "").trim().slice(0, 120);
}

function userSearchSql(qLike) {
  if (!qLike) return Prisma.empty;
  return Prisma.sql`
    AND (
      LOWER(COALESCE(u.email, '')) LIKE ${qLike} ESCAPE '\\'
      OR LOWER(COALESCE(u.username, '')) LIKE ${qLike} ESCAPE '\\'
      OR CAST(u.id AS TEXT) = ${qLike.replace(/[%]/g, "")}
      OR LOWER(COALESCE(u.wallet_address, '')) LIKE ${qLike} ESCAPE '\\'
    )
  `;
}

function signalSearchSql(fieldSql, qLike) {
  if (!qLike) return Prisma.empty;
  return Prisma.sql`AND (LOWER(${fieldSql}) LIKE ${qLike} ESCAPE '\\' OR TRUE ${userSearchSql(qLike)})`;
}

function normalizeWallet(value) {
  const s = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(s) ? s : null;
}

function similarPrefix(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
}

/** Ledger rows for these 0x addresses are expected to repeat across users (treasury / contract / sweep). */
function excludedPlatformLedgerAddresses() {
  const keys = [
    "DEPOSIT_WALLET_ADDRESS",
    "SMART_CONTRACT_ADDRESS",
    "CHECKIN_RECEIVER",
    "POLYGON_HD_SWEEP_TO_ADDRESS",
  ];
  const out = new Set();
  for (const k of keys) {
    const v = String(process.env[k] || "").trim().toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(v)) out.add(v);
  }
  return [...out];
}

function buildGroup({
  signalType,
  kind,
  key,
  users,
  ipIntelligence = null,
}: {
  signalType: string;
  kind: string;
  key: string;
  users: FraudUserRecord[];
  ipIntelligence?: Record<string, unknown> | null;
}) {
  const deduped = [...new Map(users.map((u) => [u.id, u])).values()];
  const walletCounts = new Map();
  const deviceCounts = new Map();
  const identityCounts = new Map();
  for (const user of deduped) {
    const wallet = normalizeWallet(user.walletAddress);
    if (wallet) walletCounts.set(wallet, (walletCounts.get(wallet) || 0) + 1);
    const ua = String(user.userAgent || "").trim();
    if (ua) deviceCounts.set(ua, (deviceCounts.get(ua) || 0) + 1);
    const prefix = similarPrefix(user.username || user.email);
    if (prefix.length >= 4) identityCounts.set(prefix, (identityCounts.get(prefix) || 0) + 1);
  }
  const created = deduped.map((u) => new Date(u.createdAt).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  const shortCreationWindow = created.length >= 2 && created[created.length - 1] - created[0] <= 24 * 60 * 60 * 1000;
  const risk = calculateMultiAccountRisk({
    signalType,
    fraudKind: kind,
    userCount: deduped.length,
    users: deduped,
    ipIntelligence,
    sameWalletCount: [...walletCounts.values()].filter((n) => n > 1).length,
    sameDeviceCount: [...deviceCounts.values()].filter((n) => n > 1).length,
    similarIdentityCount: [...identityCounts.values()].filter((n) => n > 1).length,
    shortCreationWindow,
  });
  return {
    id: `${signalType}:${key}`,
    kind,
    signalType,
    label: kind,
    value: key,
    key,
    userCount: deduped.length,
    users: deduped.slice(0, 25).map((u) => ({
      id: u.id,
      username: u.username ?? null,
      email: u.email,
      walletAddress: u.walletAddress ?? null,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt ?? null,
    })),
    ipIntelligence,
    riskScore: risk.score,
    riskLevel: risk.level,
    confidence: risk.confidence,
    reasons: risk.reasons,
    falsePositiveWarnings: risk.falsePositiveWarnings,
    alerts: risk.alerts,
    identityVectors: risk.identityVectors,
    identityVectorCount: risk.identityVectorCount,
    correlation: risk.correlation,
    decision: risk.decision,
    recommendedAction: risk.recommendedAction,
  };
}

type EnrichedAdminFraudGroup = ReturnType<typeof buildGroup>;

function buildUser(row: Record<string, unknown>): FraudUserRecord {
  return {
    id: Number(row.id),
    username: (row.username as string | null | undefined) ?? null,
    email: String(row.email || ""),
    walletAddress: (row.walletAddress as string | null | undefined) ?? null,
    userAgent: (row.userAgent as string | null | undefined) ?? null,
    createdAt: row.createdAt as Date,
    lastLoginAt: (row.lastLoginAt as Date | null | undefined) ?? null,
  };
}

function pushGrouped(
  groups: ClusterInput[],
  {
    rows,
    kind,
    signalType,
    keyField = "key",
  }: { rows: Array<Record<string, unknown>>; kind: string; signalType: string; keyField?: string }
) {
  const byKey = new Map<string, FraudUserRecord[]>();
  for (const row of rows) {
    const key = String(row[keyField] || "").trim();
    if (!key) continue;
    const user = buildUser(row);
    if (!Number.isSafeInteger(user.id)) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(user);
  }
  for (const [key, users] of byKey) {
    if (new Set(users.map((u) => u.id)).size < 2) continue;
    groups.push({ kind, signalType, key, users });
  }
}

async function queryDuplicateUsers(
  prisma: PrismaClient,
  { column, qLike, limit = 600 }: { column: string; qLike: unknown; limit?: number }
) {
  const fieldSql = Prisma.raw(column);
  const userFieldSql = Prisma.raw(`u.${column}`);
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH d AS (
      SELECT LOWER(BTRIM(${fieldSql})) AS k, COUNT(*)::int AS c
      FROM users
      WHERE ${fieldSql} IS NOT NULL AND BTRIM(${fieldSql}) <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    )
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", LOWER(BTRIM(${userFieldSql})) AS key
    FROM users u
    INNER JOIN d ON LOWER(BTRIM(${userFieldSql})) = d.k
    WHERE 1=1 ${signalSearchSql(Prisma.raw(`LOWER(BTRIM(u.${column}))`), qLike)}
    ORDER BY d.c DESC, key, u.id
    LIMIT ${limit}
  `;
}

async function queryIpUsers(
  prisma: PrismaClient,
  { column, qLike, limit = 600 }: { column: string; qLike: unknown; limit?: number }
) {
  const fieldSql = Prisma.raw(column);
  const userFieldSql = Prisma.raw(`u.${column}`);
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH d AS (
      SELECT ${fieldSql} AS k, COUNT(*)::int AS c
      FROM users
      WHERE ${fieldSql} IS NOT NULL AND BTRIM(${fieldSql}) <> ''
      GROUP BY ${fieldSql}
      HAVING COUNT(*) > 1
    )
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", ${userFieldSql} AS key
    FROM users u
    INNER JOIN d ON ${userFieldSql} = d.k
    WHERE 1=1 ${signalSearchSql(Prisma.raw(`LOWER(u.${column})`), qLike)}
    ORDER BY d.c DESC, key, u.id
    LIMIT ${limit}
  `;
}

async function queryAllIpUsers(
  prisma: PrismaClient,
  { column, limit = DERIVED_IP_SCAN_LIMIT }: { column: string; limit?: number }
) {
  const userFieldSql = Prisma.raw(`u.${column}`);
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", ${userFieldSql} AS key
    FROM users u
    WHERE ${userFieldSql} IS NOT NULL AND BTRIM(${userFieldSql}) <> ''
    ORDER BY COALESCE(u.last_login_at, u.created_at) DESC, u.id DESC
    LIMIT ${limit}
  `;
}

async function queryTransactionAddressUsers(
  prisma: PrismaClient,
  { column, qLike, limit = 700 }: { column: string; qLike: unknown; limit?: number }
) {
  const fieldSql = Prisma.raw(column);
  const txFieldSql = Prisma.raw(`t.${column}`);
  const excluded = excludedPlatformLedgerAddresses();
  const excludeSql =
    excluded.length > 0
      ? Prisma.sql`AND LOWER(BTRIM(${fieldSql})) NOT IN (${Prisma.join(excluded.map((a) => Prisma.sql`${a}`))})`
      : Prisma.empty;
  /** `address` is mostly withdrawal destination — aggregating all tx types would false-flag deposits/treasury noise. */
  const typeFilter = column === "address" ? Prisma.sql`AND type = 'withdrawal'` : Prisma.empty;
  const typeFilterT = column === "address" ? Prisma.sql`AND t.type = 'withdrawal'` : Prisma.empty;
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH d AS (
      SELECT LOWER(BTRIM(${fieldSql})) AS k, COUNT(DISTINCT user_id)::int AS c
      FROM transactions
      WHERE ${fieldSql} IS NOT NULL AND BTRIM(${fieldSql}) <> ''
        AND LENGTH(BTRIM(${fieldSql})) = 42
        AND BTRIM(${fieldSql}) ~ '^0[xX][0-9a-fA-F]{40}$'
        ${typeFilter}
        ${excludeSql}
      GROUP BY 1
      HAVING COUNT(DISTINCT user_id) > 1
    )
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", LOWER(BTRIM(${txFieldSql})) AS key
    FROM transactions t
    INNER JOIN d ON LOWER(BTRIM(${txFieldSql})) = d.k
    INNER JOIN users u ON u.id = t.user_id
    WHERE 1=1 ${typeFilterT} ${signalSearchSql(Prisma.raw(`LOWER(BTRIM(t.${column}))`), qLike)}
    ORDER BY d.c DESC, key, u.id
    LIMIT ${limit}
  `;
}

async function queryIpLogUsers(
  prisma: PrismaClient,
  { column, qLike, limit = 700 }: { column: string; qLike: unknown; limit?: number }
) {
  const fieldSql = Prisma.raw(`l.${column}`);
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH d AS (
      SELECT ${fieldSql} AS k, COUNT(DISTINCT l.user_id)::int AS c
      FROM ip_logs l
      WHERE ${fieldSql} IS NOT NULL AND BTRIM(${fieldSql}) <> ''
      GROUP BY ${fieldSql}
      HAVING COUNT(DISTINCT l.user_id) > 1
    )
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", ${fieldSql} AS key
    FROM ip_logs l
    INNER JOIN d ON ${fieldSql} = d.k
    INNER JOIN users u ON u.id = l.user_id
    WHERE 1=1 ${signalSearchSql(Prisma.raw(`LOWER(${fieldSql})`), qLike)}
    ORDER BY d.c DESC, key, u.id
    LIMIT ${limit}
  `;
}

async function loadCachedIpIntelligenceMap(prisma: PrismaClient, ips: unknown[]) {
  const normalized = (ips || [])
    .map((ip) => normalizeIp(ip))
    .filter((ip): ip is string => Boolean(ip));
  const uniqueIps = [...new Set(normalized)];
  if (!uniqueIps.length || !prisma?.ipIntelligenceCache?.findMany) {
    return new Map<string, Record<string, unknown>>();
  }
  const rows = await prisma.ipIntelligenceCache.findMany({ where: { ip: { in: uniqueIps } } }).catch(() => []);
  const entries: [string, Record<string, unknown>][] = [];
  for (const row of rows) {
    const ipKey = normalizeIp(row.ip);
    if (!ipKey) continue;
    entries.push([
      ipKey,
      {
        ip: row.ip,
        ipVersion: row.ipVersion,
        normalizedIp: row.ip,
        reverseDns: row.reverseDns,
        reverseDnsForwardConfirmed: row.reverseDnsForwardConfirmed,
        asn: row.asn,
        asnOrg: row.asnOrg,
        networkCidr: row.networkCidr,
        providerLabel: row.providerLabel,
        providerType: row.providerType,
        confidence: row.confidence,
        source: row.source,
        error: row.error,
        proxyDetected: row.proxyDetected ?? null,
        proxyType: row.proxyType ?? null,
        proxyRiskScore: Number.isInteger(row.proxyRiskScore) ? row.proxyRiskScore : null,
        proxyProvider: row.proxyProvider ?? null,
        proxyLastSeenAt: row.proxyLastSeenAt ?? null,
        proxyCheckedAt: row.proxyCheckedAt ?? null,
        proxyExpiresAt: row.proxyExpiresAt ?? null,
        proxySource: row.proxySource ?? null,
        proxyError: row.proxyError ?? null,
        checkedAt: row.checkedAt,
        expiresAt: row.expiresAt,
      },
    ]);
  }
  return new Map(entries);
}

type DerivedIntelRow = Record<string, unknown> & {
  normalizedIp?: string;
  ipIntelligence?: Record<string, unknown>;
};

function pushDerivedGrouped<Row extends DerivedIntelRow>(
  groups: ClusterInput[],
  {
    rows,
    kind,
    signalType,
    deriveKey,
    intelForGroup,
  }: {
    rows: Row[];
    kind: string;
    signalType: string;
    deriveKey: (row: Row) => string | null | undefined;
    intelForGroup?: (row: Row, key: string) => Record<string, unknown> | null;
  }
) {
  const byKey = new Map<
    string,
    { users: FraudUserRecord[]; ipIntelligence: Record<string, unknown> | null }
  >();
  for (const row of rows) {
    const key = deriveKey(row);
    if (!key) continue;
    const user = buildUser(row);
    if (!Number.isSafeInteger(user.id)) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        users: [],
        ipIntelligence: intelForGroup ? intelForGroup(row, key) : null,
      });
    }
    byKey.get(key)!.users.push(user);
  }
  for (const [key, entry] of byKey) {
    if (new Set(entry.users.map((user) => user.id)).size < 2) continue;
    groups.push({ kind, signalType, key, users: entry.users, ipIntelligence: entry.ipIntelligence });
  }
}

function scopeWants(scope: string, group: EnrichedAdminFraudGroup) {
  if (scope === "all") return true;
  if (scope === "wallets") return group.signalType === "profile_wallet";
  if (scope === "chain") return group.signalType === "onchain_wallet";
  if (scope === "ips" || scope === "ip_exact") return group.signalType === "registration_ip" || group.signalType === "last_ip" || group.signalType === "auth_ip_history";
  if (scope === "devices") return group.signalType === "device_fingerprint";
  if (scope === "ip_network") return group.signalType === "ip_network";
  if (scope === "asn") return group.signalType === "asn";
  if (scope === "high_risk") return group.riskLevel === "high" || group.riskLevel === "critical";
  if (scope === "low_confidence") return group.confidence === "low";
  if (scope === "false_positive") return group.falsePositiveWarnings.length > 0;
  if (scope === "shared_residential")
    return ["residential", "mobile", "corporate", "education", "public_wifi"].includes(
      String(group.ipIntelligence?.providerType ?? "")
    );
  return true;
}

function groupMatchesSearch(group: EnrichedAdminFraudGroup, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const intel = group.ipIntelligence || {};
  const values = [
    group.id,
    group.kind,
    group.signalType,
    group.value,
    intel.normalizedIp,
    intel.reverseDns,
    intel.asn ? `as${intel.asn}` : "",
    intel.asnOrg,
    intel.networkCidr,
    intel.providerLabel,
    intel.providerType,
    intel.proxyDetected === true ? "proxy" : "",
    intel.proxyType,
    intel.proxyProvider,
    Number.isInteger(intel.proxyRiskScore) ? String(intel.proxyRiskScore) : "",
    ...(group.users || []).flatMap((u) => [String(u.id), u.email, u.username, u.walletAddress]),
  ];
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

export async function listAdminFraudSignals(prisma: PrismaClient, opts: ListAdminFraudSignalsOpts = {}) {
  const scope = String(opts.scope || "all").toLowerCase();
  if (!ALLOWED_SCOPES.has(scope)) throw new Error("invalid_scope");
  const q = cleanQuery(opts.q);
  const qLike = null;
  const page = parsePage(opts.page);
  const limit = parseLimit(opts.limit ?? opts.maxClusters);

  const rawGroups: ClusterInput[] = [];
  if (["all", "wallets", "high_risk", "low_confidence", "false_positive"].includes(scope)) {
    pushGrouped(rawGroups, {
      rows: await queryDuplicateUsers(prisma, { column: "wallet_address", qLike }),
      kind: "duplicate_profile_wallet",
      signalType: "profile_wallet",
    });
  }
  if (["all", "ips", "ip_exact", "ip_network", "asn", "shared_residential", "high_risk", "low_confidence", "false_positive"].includes(scope)) {
    pushGrouped(rawGroups, {
      rows: await queryIpUsers(prisma, { column: "registration_ip", qLike }),
      kind: "duplicate_registration_ip",
      signalType: "registration_ip",
    });
    pushGrouped(rawGroups, {
      rows: await queryIpUsers(prisma, { column: "last_ip", qLike }),
      kind: "duplicate_last_ip",
      signalType: "last_ip",
    });
    pushGrouped(rawGroups, {
      rows: await queryIpLogUsers(prisma, { column: "ip", qLike }),
      kind: "shared_auth_ip_history",
      signalType: "auth_ip_history",
    });
  }
  if (["all", "devices", "high_risk", "low_confidence", "false_positive"].includes(scope)) {
    pushGrouped(rawGroups, {
      rows: await queryIpLogUsers(prisma, { column: "device_fingerprint", qLike }),
      kind: "shared_device_fingerprint",
      signalType: "device_fingerprint",
    });
  }
  if (["all", "ip_network", "asn", "shared_residential", "high_risk", "low_confidence", "false_positive"].includes(scope)) {
    const [registrationRows, lastRows] = await Promise.all([
      queryAllIpUsers(prisma, { column: "registration_ip" }),
      queryAllIpUsers(prisma, { column: "last_ip" }),
    ]);
    const derivedRows: Array<DerivedIntelRow & { normalizedIp: string }> = [...registrationRows, ...lastRows]
      .map((row): DerivedIntelRow | null => {
        const normalizedIp = normalizeIp(String(row.key ?? ""));
        return normalizedIp ? { ...row, normalizedIp } : null;
      })
      .filter((row): row is DerivedIntelRow & { normalizedIp: string } => row !== null);
    const cachedIntelligence = await loadCachedIpIntelligenceMap(prisma, derivedRows.map((row) => row.normalizedIp));
    const rowsWithIntel = derivedRows.map((row) => ({
      ...row,
      ipIntelligence: cachedIntelligence.get(row.normalizedIp) || {
        normalizedIp: row.normalizedIp,
        networkCidr: deriveDefaultNetworkCidr(row.normalizedIp),
        providerType: "unknown",
        confidence: "low",
      },
    }));

    pushDerivedGrouped(rawGroups, {
      rows: rowsWithIntel,
      kind: "shared_ipv6_subnet",
      signalType: "ip_network",
      deriveKey: (row) => deriveDefaultNetworkCidr(row.normalizedIp),
      intelForGroup: (row, key) => ({ ...(row.ipIntelligence || {}), normalizedIp: row.normalizedIp, networkCidr: key }),
    });

    const asnRows = rowsWithIntel.filter((row) => {
      const asn = row.ipIntelligence?.asn;
      return typeof asn === "number" && Number.isInteger(asn);
    });

    pushDerivedGrouped(rawGroups, {
      rows: asnRows,
      kind: "shared_asn_provider",
      signalType: "asn",
      deriveKey: (row) => `AS${Number(row.ipIntelligence?.asn)}`,
      intelForGroup: (row) => row.ipIntelligence || null,
    });
  }
  if (["all", "chain", "high_risk", "low_confidence", "false_positive"].includes(scope)) {
    pushGrouped(rawGroups, {
      rows: await queryTransactionAddressUsers(prisma, { column: "address", qLike }),
      kind: "shared_ledger_to_address",
      signalType: "onchain_wallet",
    });
    pushGrouped(rawGroups, {
      rows: await queryTransactionAddressUsers(prisma, { column: "from_address", qLike }),
      kind: "shared_ledger_from_address",
      signalType: "onchain_wallet",
    });
  }

  const enriched: EnrichedAdminFraudGroup[] = [];
  for (const group of rawGroups) {
    let ipIntelligence = group.ipIntelligence || null;
    const ip = normalizeIp(group.key);
    if (!ipIntelligence && ip && (group.signalType === "registration_ip" || group.signalType === "last_ip" || group.signalType === "auth_ip_history")) {
      ipIntelligence = await getCachedIpIntelligence(prisma, ip);
    }
    enriched.push(buildGroup({ ...group, ipIntelligence }));
  }

  enriched.sort((a, b) => b.riskScore - a.riskScore || b.userCount - a.userCount || String(a.value).localeCompare(String(b.value)));
  const filtered = enriched.filter((group) => scopeWants(scope, group) && groupMatchesSearch(group, q));
  const start = (page - 1) * limit;
  const signals = filtered.slice(start, start + limit);
  return {
    scope,
    q: q || null,
    page,
    limit,
    total: filtered.length,
    signalCount: signals.length,
    signals,
    generatedAt: new Date().toISOString(),
  };
}

/** Must match admin POST body `confirm` and the UI phrase. */
export const ADMIN_FRAUD_COLLECTION_RESET_CONFIRM = "RESET_FRAUD_COLLECTION";

/**
 * Clears anti-fraud **collection** data only. Fingerprints live in `ip_logs`.
 * - `ip_logs`: login/register IP + device fingerprint history used for clusters.
 * - `ip_intelligence_cache`: cached ASN/PTR/proxy/VPN-style lookups (rebuilt on demand).
 * - `users`: clears `registration_ip`, `last_ip`, and `user_agent` only (rows that had any set).
 * Does not alter wallet addresses, balances, payouts, deposits, or any transaction tables.
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function resetAdminFraudCollectionData(prisma: PrismaClient) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const logRes = await tx.userIpLog.deleteMany({});
    const intelRes = await tx.ipIntelligenceCache.deleteMany({});
    const profileRes = await tx.user.updateMany({
      where: {
        OR: [
          { registrationIp: { not: null } },
          { ip: { not: null } },
          { userAgent: { not: null } },
        ],
      },
      data: {
        registrationIp: null,
        ip: null,
        userAgent: null,
      },
    });
    return {
      ipLogsDeleted: logRes.count,
      ipIntelDeleted: intelRes.count,
      usersProfileAntiFraudCleared: profileRes.count,
    };
  });
}
