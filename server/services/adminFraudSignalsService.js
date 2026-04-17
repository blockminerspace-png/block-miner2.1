/**
 * Read-only admin signals: duplicate profile wallets, shared IPs, on-chain addresses
 * appearing on ledger rows for multiple distinct users.
 */

import { Prisma } from "@prisma/client";

/** @param {unknown} v */
function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ scope?: string; q?: string; maxClusters?: number }} opts
 */
export async function listAdminFraudSignals(prisma, opts = {}) {
  const scope = String(opts.scope || "all").toLowerCase();
  const qRaw = String(opts.q || "").trim().slice(0, 120);
  const maxClusters = clampInt(opts.maxClusters, 10, 80, 40);
  const qLike =
    qRaw.length > 0
      ? `%${qRaw.toLowerCase().replace(/%/g, "").replace(/_/g, "\\_").replace(/\\/g, "")}%`
      : null;

  const want = (s) => scope === "all" || scope === s;

  /** @type {Array<{ kind: string; key: string; userCount: number; users: Array<{ id: number; username: string | null; email: string }> }>} */
  const signals = [];

  const pushGrouped = (kind, rows, keyField = "key") => {
    const byKey = new Map();
    for (const row of rows) {
      const k = String(row[keyField] || "").trim();
      if (!k) continue;
      const u = {
        id: Number(row.id),
        username: row.username ?? null,
        email: String(row.email || ""),
      };
      if (!Number.isFinite(u.id)) continue;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(u);
    }
    for (const [key, users] of byKey) {
      if (users.length < 2) continue;
      const dedupe = new Map();
      for (const u of users) dedupe.set(u.id, u);
      const list = [...dedupe.values()].slice(0, 25);
      signals.push({
        kind,
        key,
        userCount: dedupe.size,
        users: list,
      });
    }
  };

  if (want("wallets")) {
    const walletRows = await prisma.$queryRaw(
      qLike
        ? Prisma.sql`
      WITH d AS (
        SELECT LOWER(BTRIM(wallet_address)) AS k, COUNT(*)::int AS c
        FROM users
        WHERE wallet_address IS NOT NULL AND BTRIM(wallet_address) <> ''
        GROUP BY 1
        HAVING COUNT(*) > 1
      )
      SELECT u.id, u.username, u.email, LOWER(BTRIM(u.wallet_address)) AS key
      FROM users u
      INNER JOIN d ON LOWER(BTRIM(u.wallet_address)) = d.k
      WHERE LOWER(BTRIM(u.wallet_address)) LIKE ${qLike} ESCAPE '\\'
      ORDER BY d.c DESC, key, u.id
      LIMIT 400
    `
        : Prisma.sql`
      WITH d AS (
        SELECT LOWER(BTRIM(wallet_address)) AS k, COUNT(*)::int AS c
        FROM users
        WHERE wallet_address IS NOT NULL AND BTRIM(wallet_address) <> ''
        GROUP BY 1
        HAVING COUNT(*) > 1
      )
      SELECT u.id, u.username, u.email, LOWER(BTRIM(u.wallet_address)) AS key
      FROM users u
      INNER JOIN d ON LOWER(BTRIM(u.wallet_address)) = d.k
      ORDER BY d.c DESC, key, u.id
      LIMIT 400
    `
    );
    pushGrouped("duplicate_profile_wallet", /** @type {any[]} */ (walletRows));
  }

  if (want("ips")) {
    const regRows = await prisma.$queryRaw(
      qLike
        ? Prisma.sql`
      WITH d AS (
        SELECT registration_ip AS k, COUNT(*)::int AS c
        FROM users
        WHERE registration_ip IS NOT NULL AND BTRIM(registration_ip) <> ''
        GROUP BY registration_ip
        HAVING COUNT(*) > 1
      )
      SELECT u.id, u.username, u.email, u.registration_ip AS key
      FROM users u
      INNER JOIN d ON u.registration_ip = d.k
      WHERE LOWER(u.registration_ip) LIKE ${qLike} ESCAPE '\\'
      ORDER BY d.c DESC, key, u.id
      LIMIT 400
    `
        : Prisma.sql`
      WITH d AS (
        SELECT registration_ip AS k, COUNT(*)::int AS c
        FROM users
        WHERE registration_ip IS NOT NULL AND BTRIM(registration_ip) <> ''
        GROUP BY registration_ip
        HAVING COUNT(*) > 1
      )
      SELECT u.id, u.username, u.email, u.registration_ip AS key
      FROM users u
      INNER JOIN d ON u.registration_ip = d.k
      ORDER BY d.c DESC, key, u.id
      LIMIT 400
    `
    );
    pushGrouped("duplicate_registration_ip", /** @type {any[]} */ (regRows));

    const lastRows = await prisma.$queryRaw(
      qLike
        ? Prisma.sql`
      WITH d AS (
        SELECT last_ip AS k, COUNT(*)::int AS c
        FROM users
        WHERE last_ip IS NOT NULL AND BTRIM(last_ip) <> ''
        GROUP BY last_ip
        HAVING COUNT(*) > 1
      )
      SELECT u.id, u.username, u.email, u.last_ip AS key
      FROM users u
      INNER JOIN d ON u.last_ip = d.k
      WHERE LOWER(u.last_ip) LIKE ${qLike} ESCAPE '\\'
      ORDER BY d.c DESC, key, u.id
      LIMIT 400
    `
        : Prisma.sql`
      WITH d AS (
        SELECT last_ip AS k, COUNT(*)::int AS c
        FROM users
        WHERE last_ip IS NOT NULL AND BTRIM(last_ip) <> ''
        GROUP BY last_ip
        HAVING COUNT(*) > 1
      )
      SELECT u.id, u.username, u.email, u.last_ip AS key
      FROM users u
      INNER JOIN d ON u.last_ip = d.k
      ORDER BY d.c DESC, key, u.id
      LIMIT 400
    `
    );
    pushGrouped("duplicate_last_ip", /** @type {any[]} */ (lastRows));
  }

  if (want("chain")) {
    const addrRows = await prisma.$queryRaw(
      qLike
        ? Prisma.sql`
      WITH d AS (
        SELECT LOWER(BTRIM(address)) AS k, COUNT(DISTINCT user_id)::int AS c
        FROM transactions
        WHERE address IS NOT NULL AND BTRIM(address) <> ''
          AND LENGTH(BTRIM(address)) = 42
          AND BTRIM(address) ~ '^0[xX][0-9a-fA-F]{40}$'
        GROUP BY 1
        HAVING COUNT(DISTINCT user_id) > 1
      )
      SELECT u.id, u.username, u.email, LOWER(BTRIM(t.address)) AS key
      FROM transactions t
      INNER JOIN d ON LOWER(BTRIM(t.address)) = d.k
      INNER JOIN users u ON u.id = t.user_id
      WHERE LOWER(BTRIM(t.address)) LIKE ${qLike} ESCAPE '\\'
      ORDER BY d.c DESC, key, u.id
      LIMIT 500
    `
        : Prisma.sql`
      WITH d AS (
        SELECT LOWER(BTRIM(address)) AS k, COUNT(DISTINCT user_id)::int AS c
        FROM transactions
        WHERE address IS NOT NULL AND BTRIM(address) <> ''
          AND LENGTH(BTRIM(address)) = 42
          AND BTRIM(address) ~ '^0[xX][0-9a-fA-F]{40}$'
        GROUP BY 1
        HAVING COUNT(DISTINCT user_id) > 1
      )
      SELECT u.id, u.username, u.email, LOWER(BTRIM(t.address)) AS key
      FROM transactions t
      INNER JOIN d ON LOWER(BTRIM(t.address)) = d.k
      INNER JOIN users u ON u.id = t.user_id
      ORDER BY d.c DESC, key, u.id
      LIMIT 500
    `
    );
    pushGrouped("shared_ledger_to_address", /** @type {any[]} */ (addrRows));

    const fromRows = await prisma.$queryRaw(
      qLike
        ? Prisma.sql`
      WITH d AS (
        SELECT LOWER(BTRIM(from_address)) AS k, COUNT(DISTINCT user_id)::int AS c
        FROM transactions
        WHERE from_address IS NOT NULL AND BTRIM(from_address) <> ''
          AND LENGTH(BTRIM(from_address)) = 42
          AND BTRIM(from_address) ~ '^0[xX][0-9a-fA-F]{40}$'
        GROUP BY 1
        HAVING COUNT(DISTINCT user_id) > 1
      )
      SELECT u.id, u.username, u.email, LOWER(BTRIM(t.from_address)) AS key
      FROM transactions t
      INNER JOIN d ON LOWER(BTRIM(t.from_address)) = d.k
      INNER JOIN users u ON u.id = t.user_id
      WHERE LOWER(BTRIM(t.from_address)) LIKE ${qLike} ESCAPE '\\'
      ORDER BY d.c DESC, key, u.id
      LIMIT 500
    `
        : Prisma.sql`
      WITH d AS (
        SELECT LOWER(BTRIM(from_address)) AS k, COUNT(DISTINCT user_id)::int AS c
        FROM transactions
        WHERE from_address IS NOT NULL AND BTRIM(from_address) <> ''
          AND LENGTH(BTRIM(from_address)) = 42
          AND BTRIM(from_address) ~ '^0[xX][0-9a-fA-F]{40}$'
        GROUP BY 1
        HAVING COUNT(DISTINCT user_id) > 1
      )
      SELECT u.id, u.username, u.email, LOWER(BTRIM(t.from_address)) AS key
      FROM transactions t
      INNER JOIN d ON LOWER(BTRIM(t.from_address)) = d.k
      INNER JOIN users u ON u.id = t.user_id
      ORDER BY d.c DESC, key, u.id
      LIMIT 500
    `
    );
    pushGrouped("shared_ledger_from_address", /** @type {any[]} */ (fromRows));
  }

  signals.sort((a, b) => b.userCount - a.userCount || String(a.key).localeCompare(String(b.key)));

  const limited = signals.slice(0, maxClusters);

  return {
    scope,
    q: qRaw || null,
    maxClusters,
    signalCount: limited.length,
    signals: limited,
    generatedAt: new Date().toISOString(),
  };
}
