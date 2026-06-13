import _prisma from "../../src/db/prisma.js";
import { createRewardInboxEntry } from "../../services/rewardInboxService.js";
import loggerLib from "../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("BurnEventsService");

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function adminListEvents() {
  return prisma.burnEvent.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      rewardMiner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true, slotSize: true } },
      _count: { select: { claims: true } },
    },
  });
}

export type AdminEventInput = {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  requiredHashRate: number;
  rewardMinerId: number;
  claimLimitPerUser?: number;
  stockTotal?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
};

export async function adminCreateEvent(data: AdminEventInput) {
  if (!data.title || data.title.trim().length === 0) throw new Error("Title is required");
  if (!(data.requiredHashRate > 0)) throw new Error("requiredHashRate must be > 0");
  const miner = await prisma.miner.findUnique({ where: { id: data.rewardMinerId } });
  if (!miner) throw new Error("Reward miner not found");
  return prisma.burnEvent.create({
    data: {
      title: data.title.trim(),
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      requiredHashRate: data.requiredHashRate,
      rewardMinerId: data.rewardMinerId,
      claimLimitPerUser: Math.max(1, data.claimLimitPerUser ?? 1),
      stockTotal: data.stockTotal ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      isActive: data.isActive ?? true,
    },
  });
}

export async function adminUpdateEvent(id: number, data: Partial<AdminEventInput>) {
  return prisma.burnEvent.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.requiredHashRate !== undefined && { requiredHashRate: data.requiredHashRate }),
      ...(data.rewardMinerId !== undefined && { rewardMinerId: data.rewardMinerId }),
      ...(data.claimLimitPerUser !== undefined && { claimLimitPerUser: Math.max(1, data.claimLimitPerUser) }),
      ...(data.stockTotal !== undefined && { stockTotal: data.stockTotal }),
      ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
      ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

export async function adminSoftDeleteEvent(id: number) {
  return prisma.burnEvent.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

export async function adminListClaims(eventId: number, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [claims, total] = await Promise.all([
    prisma.burnClaim.findMany({
      where: { eventId },
      orderBy: { claimedAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: { id: true, username: true, name: true } } },
    }),
    prisma.burnClaim.count({ where: { eventId } }),
  ]);
  return { claims, total, page, limit };
}

// ─── Public / user ────────────────────────────────────────────────────────────

function isEventCurrentlyOpen(event: { isActive: boolean; deletedAt: Date | null; startsAt: Date | null; endsAt: Date | null; stockTotal: number | null; stockClaimed: number; }): boolean {
  if (!event.isActive || event.deletedAt) return false;
  const now = new Date();
  if (event.startsAt && now < event.startsAt) return false;
  if (event.endsAt && now > event.endsAt) return false;
  if (event.stockTotal != null && event.stockClaimed >= event.stockTotal) return false;
  return true;
}

export async function listActiveEvents(userId?: number) {
  const events = await prisma.burnEvent.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      rewardMiner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true, slotSize: true, tier: true } },
    },
  });

  const filtered = events.filter(isEventCurrentlyOpen);

  if (!userId) {
    return filtered.map((e: any) => ({ ...e, userClaimsCount: 0, userCanClaim: true }));
  }

  const userCounts = await prisma.burnClaim.groupBy({
    by: ["eventId"],
    where: { userId, eventId: { in: filtered.map((e: any) => e.id) } },
    _count: { id: true },
  });
  const countMap = new Map<number, number>(userCounts.map((r: any) => [r.eventId, r._count.id]));
  return filtered.map((e: any) => {
    const userClaimsCount = countMap.get(e.id) ?? 0;
    return { ...e, userClaimsCount, userCanClaim: userClaimsCount < e.claimLimitPerUser };
  });
}

export async function getUserBurnableMachines(userId: number) {
  // Pull from inventory + rack (UserMiner) via canonical UserOwnedMachine.
  // We only allow burning machines whose location is INVENTORY or RACK.
  const machines = await prisma.userOwnedMachine.findMany({
    where: { userId, location: { in: ["INVENTORY", "RACK"] } },
    orderBy: [{ hashRate: "desc" }, { id: "asc" }],
    select: {
      id: true,
      location: true,
      minerName: true,
      hashRate: true,
      slotSize: true,
      imageUrl: true,
      level: true,
    },
  });
  return machines;
}

export async function claimBurnEvent(userId: number, eventId: number, ownedMachineIds: number[]) {
  if (!Array.isArray(ownedMachineIds) || ownedMachineIds.length === 0) {
    throw Object.assign(new Error("NO_MACHINES_SELECTED"), { code: "NO_MACHINES_SELECTED" });
  }
  const uniqueIds = Array.from(new Set(ownedMachineIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)));
  if (uniqueIds.length === 0) {
    throw Object.assign(new Error("NO_MACHINES_SELECTED"), { code: "NO_MACHINES_SELECTED" });
  }

  // Reload engine after the tx, only if we burned anything from the rack.
  let burnedFromRack = false;
  let rewardInboxId: number | null = null;

  await prisma.$transaction(async (tx: any) => {
    const event = await tx.burnEvent.findUnique({
      where: { id: eventId },
      include: { rewardMiner: true },
    });
    if (!event) throw Object.assign(new Error("EVENT_NOT_FOUND"), { code: "EVENT_NOT_FOUND" });
    if (!isEventCurrentlyOpen(event)) throw Object.assign(new Error("EVENT_CLOSED"), { code: "EVENT_CLOSED" });

    const userClaimCount = await tx.burnClaim.count({ where: { eventId, userId } });
    if (userClaimCount >= event.claimLimitPerUser) {
      throw Object.assign(new Error("CLAIM_LIMIT_REACHED"), { code: "CLAIM_LIMIT_REACHED" });
    }

    // Lock-check stock again inside tx
    if (event.stockTotal != null && event.stockClaimed >= event.stockTotal) {
      throw Object.assign(new Error("OUT_OF_STOCK"), { code: "OUT_OF_STOCK" });
    }

    // Load machines, validate ownership + location
    const machines = await tx.userOwnedMachine.findMany({
      where: { id: { in: uniqueIds }, userId, location: { in: ["INVENTORY", "RACK"] } },
    });
    if (machines.length !== uniqueIds.length) {
      throw Object.assign(new Error("INVALID_MACHINES"), { code: "INVALID_MACHINES" });
    }

    const totalHashRate = machines.reduce((sum: number, m: any) => sum + Number(m.hashRate || 0), 0);
    if (totalHashRate < event.requiredHashRate) {
      throw Object.assign(new Error("INSUFFICIENT_HASHRATE"), { code: "INSUFFICIENT_HASHRATE" });
    }

    burnedFromRack = machines.some((m: any) => m.location === "RACK");

    // Burn: delete child rows first (onDelete: Restrict on UserOwnedMachine), then UserOwnedMachine.
    await tx.userMiner.deleteMany({ where: { ownedMachineId: { in: uniqueIds } } });
    await tx.userInventory.deleteMany({ where: { ownedMachineId: { in: uniqueIds } } });
    await tx.userVault.deleteMany({ where: { ownedMachineId: { in: uniqueIds } } });
    await tx.userOwnedMachine.deleteMany({ where: { id: { in: uniqueIds }, userId } });

    // Increment stock
    await tx.burnEvent.update({
      where: { id: eventId },
      data: { stockClaimed: { increment: 1 } },
    });

    // Reward via reward inbox
    const reward = event.rewardMiner;
    const inbox = await createRewardInboxEntry(tx, {
      userId,
      source: "burn_event",
      rewardType: "machine",
      rewardValue: Number(reward.baseHashRate ?? 0),
      minerId: reward.id,
      minerName: reward.name,
      minerImageUrl: reward.imageUrl ?? null,
      slotSize: reward.slotSize ?? 1,
      metaJson: { burnEventId: event.id, burnEventTitle: event.title },
    });
    rewardInboxId = inbox.id;

    // Audit / snapshot
    await tx.burnClaim.create({
      data: {
        eventId,
        userId,
        totalHashRate,
        burnedMachinesJson: machines.map((m: any) => ({
          id: m.id, name: m.minerName, hashRate: m.hashRate, slotSize: m.slotSize, location: m.location,
        })) as any,
        rewardMinerName: reward.name,
        rewardInboxId: inbox.id,
      },
    });

    logger.info("burn.claim", { userId, eventId, burned: uniqueIds.length, totalHashRate, rewardMiner: reward.name });
  });

  if (burnedFromRack) {
    try {
      const { syncUserBaseHashRate } = await import("../../models/minerProfileModel.js");
      const { getMiningEngine } = await import("../../src/miningEngineInstance.js");
      await syncUserBaseHashRate(userId);
      getMiningEngine()?.reloadMinerProfile(userId).catch(() => {});
    } catch (err) {
      logger.error("burn.engine_reload_failed", { userId, err: String(err) });
    }
  }

  return { ok: true, rewardInboxId };
}
