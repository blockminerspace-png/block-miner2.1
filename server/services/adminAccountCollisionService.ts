/**
 * Admin-only hints: find other accounts that share IPs or EVM addresses with a player / withdrawal.
 * Uses case-insensitive address matching for 0x + 40 hex.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

export function normalizeEvmAddress(addr: unknown): string | null {
  if (addr == null || typeof addr !== "string") return null;
  const t = addr.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(t)) return null;
  return t;
}

function uniqueNormalizedEvmAddresses(addrs: string[]): string[] {
  const out = new Map<string, string>();
  for (const a of addrs) {
    const k = normalizeEvmAddress(a);
    if (k) out.set(k, k);
  }
  return [...out.values()];
}

const userPick = {
  id: true,
  username: true,
  email: true,
  createdAt: true,
} as const;

type UserMini = Prisma.UserGetPayload<{ select: typeof userPick }>;

export type PendingWithdrawalForCollision = Prisma.TransactionGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        username: true;
        email: true;
        walletAddress: true;
        registrationIp: true;
        ip: true;
      };
    };
  };
}>;

/**
 * Other users whose profile wallet equals this address (case-insensitive).
 */
export async function findUsersWithProfileWallet(
  prisma: PrismaClient,
  normalizedKey: string,
  excludeUserId: number,
): Promise<UserMini[]> {
  if (!normalizedKey) return [];
  return prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      walletAddress: { equals: normalizedKey, mode: "insensitive" },
    },
    select: userPick,
    take: 30,
    orderBy: { id: "asc" },
  });
}

type TouchUserAgg = UserMini & { via: Set<string> };

/**
 * Other users who appear to use this chain address (profile, custodial deposit row, or any transaction row).
 */
export async function findUsersTouchingChainAddress(
  prisma: PrismaClient,
  normalizedKey: string,
  excludeUserId: number,
): Promise<Array<UserMini & { via: string[] }>> {
  if (!normalizedKey) return [];

  const byId = new Map<number, TouchUserAgg>();

  const add = (u: UserMini | null | undefined, via: string) => {
    if (!u || u.id === excludeUserId) return;
    const prev = byId.get(u.id) || { ...u, via: new Set<string>() };
    prev.via.add(via);
    byId.set(u.id, prev);
  };

  const [profiles, polys, txs] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { not: excludeUserId },
        walletAddress: { equals: normalizedKey, mode: "insensitive" },
      },
      select: userPick,
      take: 30,
    }),
    prisma.polygonHdAddress.findMany({
      where: {
        address: { equals: normalizedKey, mode: "insensitive" },
        userId: { not: excludeUserId },
      },
      include: { user: { select: userPick } },
      take: 30,
    }),
    prisma.transaction.findMany({
      where: {
        userId: { not: excludeUserId },
        OR: [
          { address: { equals: normalizedKey, mode: "insensitive" } },
          { fromAddress: { equals: normalizedKey, mode: "insensitive" } },
        ],
      },
      select: { userId: true, user: { select: userPick } },
      take: 120,
    }),
  ]);

  for (const u of profiles) add(u, "profile_wallet");
  for (const row of polys) add(row.user, "polygon_hd_deposit");
  for (const row of txs) {
    if (row.user) add(row.user, "transaction_ledger");
  }

  return [...byId.values()].map(({ via, ...u }) => ({
    ...u,
    via: [...via].sort(),
  }));
}

type IpOverlapUser = UserMini & {
  registrationIp: string | null;
  ip: string | null;
  ipOverlapReasons: string[];
};

/**
 * Any overlap between this user's registration / last IP and another user's registration or last IP.
 */
export async function findUsersSharingAnyIp(
  prisma: PrismaClient,
  ips: { registrationIp?: string | null; ip?: string | null },
  excludeUserId: number,
): Promise<{ ipOverlapUsers: IpOverlapUser[] }> {
  const tr = ips.registrationIp != null ? String(ips.registrationIp).trim() : "";
  const tl = ips.ip != null ? String(ips.ip).trim() : "";
  const list = [...new Set([tr, tl].filter(Boolean))];
  if (list.length === 0) {
    return { ipOverlapUsers: [] };
  }

  const others = await prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      OR: [{ registrationIp: { in: list } }, { ip: { in: list } }],
    },
    select: {
      ...userPick,
      registrationIp: true,
      ip: true,
    },
    take: 80,
    orderBy: { id: "asc" },
  });

  const ipOverlapUsers: IpOverlapUser[] = [];
  for (const u of others) {
    const reasons = new Set<string>();
    if (tr && (u.registrationIp === tr || u.ip === tr)) reasons.add("reg_ip");
    if (tl && (u.registrationIp === tl || u.ip === tl)) reasons.add("last_ip");
    if (reasons.size === 0) continue;
    ipOverlapUsers.push({
      ...u,
      ipOverlapReasons: [...reasons].sort(),
    });
  }

  return { ipOverlapUsers };
}

/**
 * Full dossier block: IPs + overlaps for profile wallet + all known chain addresses.
 */
export async function buildDossierAccountCollisions(
  prisma: PrismaClient,
  userId: number,
  knownWalletAddresses: string[] | null | undefined,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      registrationIp: true,
      ip: true,
      walletAddress: true,
    },
  });
  if (!user) return null;

  const keys = uniqueNormalizedEvmAddresses([...(knownWalletAddresses || []), user.walletAddress || ""]);

  const [ipHits, profileDupes, perAddress] = await Promise.all([
    findUsersSharingAnyIp(prisma, { registrationIp: user.registrationIp, ip: user.ip }, userId),
    (async () => {
      const pk = normalizeEvmAddress(user.walletAddress);
      if (!pk) return [];
      return findUsersWithProfileWallet(prisma, pk, userId);
    })(),
    (async () => {
      const out: Array<{ address: string; otherUsers: Awaited<ReturnType<typeof findUsersTouchingChainAddress>> }> = [];
      const maxAddr = 25;
      for (const k of keys.slice(0, maxAddr)) {
        const others = await findUsersTouchingChainAddress(prisma, k, userId);
        if (others.length) out.push({ address: k, otherUsers: others });
      }
      return out;
    })(),
  ]);

  const hasRisk = ipHits.ipOverlapUsers.length > 0 || profileDupes.length > 0 || perAddress.length > 0;

  return {
    hasRisk,
    registrationIp: user.registrationIp,
    lastIp: user.ip,
    ipOverlapUsers: ipHits.ipOverlapUsers,
    profileWalletDuplicateUsers: profileDupes,
    chainAddressOverlaps: perAddress,
  };
}

export async function buildWithdrawalCollisionHints(
  prisma: PrismaClient,
  row: PendingWithdrawalForCollision,
) {
  const excludeUserId = row.userId;
  const user = row.user;

  const destKey = normalizeEvmAddress(row.address);
  const profileKey = normalizeEvmAddress(user?.walletAddress);

  const [ipHits, destOthers, profileDupes] = await Promise.all([
    findUsersSharingAnyIp(
      prisma,
      {
        registrationIp: user?.registrationIp ?? null,
        ip: user?.ip ?? null,
      },
      excludeUserId,
    ),
    destKey ? findUsersTouchingChainAddress(prisma, destKey, excludeUserId) : Promise.resolve([]),
    profileKey ? findUsersWithProfileWallet(prisma, profileKey, excludeUserId) : Promise.resolve([]),
  ]);

  const hasRisk = ipHits.ipOverlapUsers.length > 0 || destOthers.length > 0 || profileDupes.length > 0;

  return {
    hasRisk,
    withdrawalDestination: row.address || null,
    withdrawalDestinationNormalized: destKey,
    ipOverlapUsers: ipHits.ipOverlapUsers,
    /** Other accounts linked to the same destination address (profile / custodial / ledger). */
    otherUsersForDestination: destOthers,
    /** Other accounts using the same profile wallet as this user. */
    otherUsersForProfileWallet: profileDupes,
  };
}

export async function enrichWithdrawalsWithCollisionHints(
  prisma: PrismaClient,
  withdrawals: PendingWithdrawalForCollision[],
) {
  const rows = Array.isArray(withdrawals) ? withdrawals : [];
  const hints = await Promise.all(rows.map((w) => buildWithdrawalCollisionHints(prisma, w)));
  return rows.map((w, i) => ({
    ...w,
    amount: Number(w.amount),
    collisionHints: hints[i]!,
  }));
}
