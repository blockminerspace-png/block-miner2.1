/**
 * Aggregates read-only player data for admin support tooling (support ticket context).
 * No mutations. Each data slice is loaded independently so one failing table/query
 * does not fail the whole dossier (partial results for admins).
 */

import logger from "../utils/logger.js";
import { buildDossierAccountCollisions } from "./adminAccountCollisionService.js";

const dossierLog = logger.child("SupportPlayerDossier");

/** @param {unknown} v */
export function toNumberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @template T
 * @param {string} sliceName
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | null>}
 */
async function loadDossierSlice(sliceName, fn) {
  try {
    return await fn();
  } catch (e) {
    const code = /** @type {{ code?: string }} */ (e)?.code;
    const message = String(/** @type {{ message?: unknown }} */ (e)?.message ?? e).slice(0, 500);
    dossierLog.warn(`Dossier slice skipped: ${sliceName}`, { code, message });
    return null;
  }
}

function primaryWalletList(walletAddress) {
  if (!walletAddress || typeof walletAddress !== "string") return [];
  const t = walletAddress.trim();
  return t ? [t] : [];
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {number} userId
 * @param {string | null | undefined} primaryWallet
 * @param {number} sampleSize
 * @returns {Promise<string[]>}
 */
export async function collectKnownWalletAddresses(prisma, userId, primaryWallet, sampleSize = 400) {
  const set = new Map();
  const add = (addr) => {
    if (!addr || typeof addr !== "string") return;
    const t = addr.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (!set.has(key)) set.set(key, t);
  };

  add(primaryWallet);

  const [txRows, ticketRows] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: sampleSize,
      select: { address: true, fromAddress: true },
    }),
    prisma.depositTicket.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(200, sampleSize),
      select: { walletAddress: true },
    }),
  ]);

  for (const r of txRows) {
    add(r.address);
    add(r.fromAddress);
  }
  for (const r of ticketRows) {
    add(r.walletAddress);
  }

  return Array.from(set.values());
}

/**
 * @param {object} q
 * @param {string} [q.limit]
 * @param {string} [q.depositsPage]
 * @param {string} [q.ccpaymentPage]
 * @param {string} [q.depositTicketsPage]
 * @param {string} [q.withdrawalsPage]
 * @param {string} [q.payoutsPage]
 * @param {string} [q.minersPage]
 * @param {string} [q.inventoryPage]
 * @param {string} [q.vaultPage]
 */
export function parseDossierPagination(q) {
  const limit = Math.min(80, Math.max(10, parseInt(String(q?.limit ?? "30"), 10) || 30));
  const page = (key, def = 1) => {
    const n = parseInt(String(q?.[key] ?? def), 10);
    return !Number.isFinite(n) || n < 1 ? 1 : n;
  };
  return {
    limit,
    depositsPage: page("depositsPage"),
    ccpaymentPage: page("ccpaymentPage"),
    depositTicketsPage: page("depositTicketsPage"),
    withdrawalsPage: page("withdrawalsPage"),
    payoutsPage: page("payoutsPage"),
    minersPage: page("minersPage"),
    inventoryPage: page("inventoryPage"),
    vaultPage: page("vaultPage"),
  };
}

function skipFor(page, limit) {
  return (page - 1) * limit;
}

/**
 * Staging / partial DBs may lag migrations (e.g. `ccpayment_deposit_events`).
 * Exported for unit tests.
 * @param {unknown} e
 */
export function isPrismaMissingRelationError(e) {
  const code = /** @type {{ code?: string }} */ (e)?.code;
  const msg = String(/** @type {{ message?: unknown }} */ (e)?.message ?? e);
  return (
    code === "P2021" ||
    code === "P2022" ||
    code === "42P01" ||
    /does not exist in the current database/i.test(msg) ||
    /relation .+ does not exist/i.test(msg) ||
    /column .+ does not exist/i.test(msg)
  );
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {number} ticketId
 * @param {Record<string, string | undefined>} query
 * @returns {Promise<
 *   | { ok: false; code: "NOT_FOUND" }
 *   | { ok: true; linked: false; ticket: object; dossier: null }
 *   | { ok: true; linked: true; ticket: object; userId: number; dossier: object }
 * >}
 */
export async function getSupportTicketPlayerDossier(prisma, ticketId, query) {
  const ticket = await prisma.supportMessage.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, name: true, email: true },
  });

  if (!ticket) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const ticketPublic = {
    id: ticket.id,
    name: ticket.name,
    email: ticket.email,
  };

  if (ticket.userId == null) {
    return {
      ok: true,
      linked: false,
      ticket: ticketPublic,
      dossier: null,
    };
  }

  const userId = ticket.userId;
  const p = parseDossierPagination(query);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      walletAddress: true,
      registrationIp: true,
      ip: true,
      isBanned: true,
      createdAt: true,
      lastLoginAt: true,
      polBalance: true,
      blkBalance: true,
    },
  });

  if (!user) {
    return {
      ok: true,
      linked: true,
      userId,
      ticket: ticketPublic,
      dossier: null,
      orphanTicket: true,
    };
  }

  const [
    walletAddresses,
    depositSplit,
    withdrawalSplit,
    ccpaymentSplit,
    depositTicketsSplit,
    payoutsSplit,
    minersSplit,
    inventorySplit,
    vaultSplit,
  ] = await Promise.all([
    loadDossierSlice("walletAddresses", () =>
      collectKnownWalletAddresses(prisma, userId, user.walletAddress, 400)
    ),
    loadDossierSlice("depositTransactions", async () => {
      const [total, rows] = await Promise.all([
        prisma.transaction.count({ where: { userId, type: "deposit" } }),
        prisma.transaction.findMany({
          where: { userId, type: "deposit" },
          orderBy: { createdAt: "desc" },
          skip: skipFor(p.depositsPage, p.limit),
          take: p.limit,
          select: {
            id: true,
            amount: true,
            fee: true,
            status: true,
            txHash: true,
            address: true,
            fromAddress: true,
            createdAt: true,
            completedAt: true,
          },
        }),
      ]);
      return { total, rows };
    }),
    loadDossierSlice("withdrawalTransactions", async () => {
      const [total, rows] = await Promise.all([
        prisma.transaction.count({ where: { userId, type: "withdrawal" } }),
        prisma.transaction.findMany({
          where: { userId, type: "withdrawal" },
          orderBy: { createdAt: "desc" },
          skip: skipFor(p.withdrawalsPage, p.limit),
          take: p.limit,
          select: {
            id: true,
            amount: true,
            fee: true,
            status: true,
            txHash: true,
            address: true,
            createdAt: true,
            completedAt: true,
          },
        }),
      ]);
      return { total, rows };
    }),
    loadDossierSlice("ccpaymentDeposits", async () => {
      const [total, rows] = await Promise.all([
        prisma.ccpaymentDepositEvent.count({ where: { userId } }),
        prisma.ccpaymentDepositEvent.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: skipFor(p.ccpaymentPage, p.limit),
          take: p.limit,
          select: {
            id: true,
            recordId: true,
            amountPol: true,
            payStatus: true,
            credited: true,
            txHash: true,
            createdAt: true,
          },
        }),
      ]);
      return { total, rows };
    }),
    loadDossierSlice("depositTickets", async () => {
      const [total, rows] = await Promise.all([
        prisma.depositTicket.count({ where: { userId } }),
        prisma.depositTicket.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: skipFor(p.depositTicketsPage, p.limit),
          take: p.limit,
          select: {
            id: true,
            walletAddress: true,
            txHash: true,
            amountClaimed: true,
            status: true,
            creditedAmount: true,
            createdAt: true,
          },
        }),
      ]);
      return { total, rows };
    }),
    loadDossierSlice("payouts", async () => {
      const [total, rows] = await Promise.all([
        prisma.payout.count({ where: { userId } }),
        prisma.payout.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: skipFor(p.payoutsPage, p.limit),
          take: p.limit,
          select: {
            id: true,
            amountPol: true,
            source: true,
            txHash: true,
            createdAt: true,
          },
        }),
      ]);
      return { total, rows };
    }),
    loadDossierSlice("userMiners", async () => {
      const [total, rows] = await Promise.all([
        prisma.userMiner.count({ where: { userId } }),
        prisma.userMiner.findMany({
          where: { userId },
          orderBy: { slotIndex: "asc" },
          skip: skipFor(p.minersPage, p.limit),
          take: p.limit,
          include: {
            miner: { select: { name: true, slug: true, imageUrl: true } },
          },
        }),
      ]);
      return { total, rows };
    }),
    loadDossierSlice("userInventory", async () => {
      const [total, rows] = await Promise.all([
        prisma.userInventory.count({ where: { userId } }),
        prisma.userInventory.findMany({
          where: { userId },
          orderBy: { acquiredAt: "desc" },
          skip: skipFor(p.inventoryPage, p.limit),
          take: p.limit,
          include: {
            miner: { select: { name: true, slug: true, imageUrl: true } },
          },
        }),
      ]);
      return { total, rows };
    }),
    loadDossierSlice("userVault", async () => {
      const [total, rows] = await Promise.all([
        prisma.userVault.count({ where: { userId } }),
        prisma.userVault.findMany({
          where: { userId },
          orderBy: { storedAt: "desc" },
          skip: skipFor(p.vaultPage, p.limit),
          take: p.limit,
          include: {
            miner: { select: { name: true, slug: true, imageUrl: true } },
          },
        }),
      ]);
      return { total, rows };
    }),
  ]);

  const walletAddressesResolved =
    walletAddresses ?? primaryWalletList(user.walletAddress);

  const accountCollisions = await loadDossierSlice("accountCollisions", () =>
    buildDossierAccountCollisions(prisma, userId, walletAddressesResolved ?? [])
  );

  const depositTxTotal = depositSplit?.total ?? 0;
  const depositTxRows = depositSplit?.rows ?? [];
  const withdrawalTxTotal = withdrawalSplit?.total ?? 0;
  const withdrawalTxRows = withdrawalSplit?.rows ?? [];
  const ccpaymentTotal = ccpaymentSplit?.total ?? 0;
  const ccpaymentRows = ccpaymentSplit?.rows ?? [];
  const depositTicketsTotal = depositTicketsSplit?.total ?? 0;
  const depositTicketsRows = depositTicketsSplit?.rows ?? [];
  const payoutsTotal = payoutsSplit?.total ?? 0;
  const payoutsRows = payoutsSplit?.rows ?? [];
  const minersTotal = minersSplit?.total ?? 0;
  const minersRows = minersSplit?.rows ?? [];
  const inventoryTotal = inventorySplit?.total ?? 0;
  const inventoryRows = inventorySplit?.rows ?? [];
  const vaultTotal = vaultSplit?.total ?? 0;
  const vaultRows = vaultSplit?.rows ?? [];

  const mapTx = (t) => ({
    ...t,
    amount: toNumberOrNull(t.amount),
    fee: t.fee != null ? toNumberOrNull(t.fee) : null,
  });

  const mapCcp = (c) => ({
    ...c,
    amountPol: c.amountPol != null ? toNumberOrNull(c.amountPol) : null,
  });

  const mapTicket = (d) => ({
    ...d,
    amountClaimed: d.amountClaimed != null ? toNumberOrNull(d.amountClaimed) : null,
    creditedAmount: d.creditedAmount != null ? toNumberOrNull(d.creditedAmount) : null,
  });

  const miners = minersRows.map((m) => ({
    id: m.id,
    slotIndex: m.slotIndex,
    level: m.level,
    hashRate: m.hashRate,
    slotSize: m.slotSize,
    isActive: m.isActive,
    purchasedAt: m.purchasedAt,
    minerId: m.minerId,
    displayName: m.miner?.name ?? "Miner",
    slug: m.miner?.slug ?? null,
    imageUrl: m.imageUrl || m.miner?.imageUrl || null,
  }));

  const inventoryMachines = inventoryRows.map((row) => ({
    id: row.id,
    level: row.level,
    hashRate: row.hashRate,
    slotSize: row.slotSize,
    minerId: row.minerId,
    displayName: row.miner?.name || row.minerName || "Miner",
    slug: row.miner?.slug ?? null,
    imageUrl: row.imageUrl || row.miner?.imageUrl || null,
    acquiredAt: row.acquiredAt,
    expiresAt: row.expiresAt,
  }));

  const vaultMachines = vaultRows.map((row) => ({
    id: row.id,
    level: row.level,
    hashRate: row.hashRate,
    slotSize: row.slotSize,
    minerId: row.minerId,
    displayName: row.miner?.name || row.minerName || "Miner",
    slug: row.miner?.slug ?? null,
    imageUrl: row.imageUrl || row.miner?.imageUrl || null,
    storedAt: row.storedAt,
  }));

  return {
    ok: true,
    linked: true,
    userId,
    ticket: ticketPublic,
    dossier: {
      summary: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        registrationIp: user.registrationIp,
        lastIp: user.ip,
        isBanned: user.isBanned,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        polBalance: toNumberOrNull(user.polBalance),
        blkBalance: toNumberOrNull(user.blkBalance),
      },
      walletAddresses: walletAddressesResolved,
      accountCollisions,
      depositTransactions: {
        rows: depositTxRows.map(mapTx),
        total: depositTxTotal,
        page: p.depositsPage,
        limit: p.limit,
      },
      ccpaymentDeposits: {
        rows: ccpaymentRows.map(mapCcp),
        total: ccpaymentTotal,
        page: p.ccpaymentPage,
        limit: p.limit,
      },
      depositTickets: {
        rows: depositTicketsRows.map(mapTicket),
        total: depositTicketsTotal,
        page: p.depositTicketsPage,
        limit: p.limit,
      },
      withdrawalTransactions: {
        rows: withdrawalTxRows.map(mapTx),
        total: withdrawalTxTotal,
        page: p.withdrawalsPage,
        limit: p.limit,
      },
      payouts: {
        rows: payoutsRows,
        total: payoutsTotal,
        page: p.payoutsPage,
        limit: p.limit,
      },
      miners: {
        rows: miners,
        total: minersTotal,
        page: p.minersPage,
        limit: p.limit,
      },
      inventory: {
        rows: inventoryMachines,
        total: inventoryTotal,
        page: p.inventoryPage,
        limit: p.limit,
      },
      vault: {
        rows: vaultMachines,
        total: vaultTotal,
        page: p.vaultPage,
        limit: p.limit,
      },
    },
  };
}
