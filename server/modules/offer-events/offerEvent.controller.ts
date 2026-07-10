import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import { isOfferEventActiveForPublic, hasEventMinerStock } from "../../services/offerEventHelpers.js";
import { purchaseEventMinerForUser } from "../../services/offerEventPurchaseService.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation
} from "../../utils/criticalMutationIdempotency.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../../utils/securityErrors.js";
import loggerLib, { logUserActivity } from "../../utils/logger.js";
const logger = loggerLib.child("offerEvent.controller");
import type { EventMiner, OfferEvent } from "@prisma/client";

type IdempotencyLeaseHandle = { type: "lease"; leaseToken: string };

function asIdempotencyLease(lease: unknown): IdempotencyLeaseHandle {
  return lease as IdempotencyLeaseHandle;
}

export function buildPublicOfferEventsWhere(now: Date) {
  return {
    deletedAt: null,
    isActive: true,
    endsAt: { gte: now }
  };
}

function errCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code: unknown }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

function serializeMinerPublic(m: EventMiner, claimMap: Record<number, number> = {}) {
  const remaining =
    m.stockUnlimited || m.stockCount == null ? null : Math.max(0, (m.stockCount ?? 0) - (m.soldCount ?? 0));
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    imageUrl: m.imageUrl,
    price: Number(m.price),
    hashRate: m.hashRate,
    currency: m.currency,
    slotSize: m.slotSize,
    inStock: hasEventMinerStock(m),
    remaining,
    isFree: m.isFree,
    claimLimitPerUser: m.claimLimitPerUser,
    userClaimCount: claimMap[m.id] ?? 0
  };
}

function serializeEventPublic(e: OfferEvent & { miners?: EventMiner[] }, now: Date, claimMap: Record<number, number> = {}) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    imageUrl: e.imageUrl,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    isActive: e.isActive,
    miners: (e.miners ?? []).map((m) => serializeMinerPublic(m, claimMap)),
    isLive: isOfferEventActiveForPublic(now, e)
  };
}

export async function listActiveOfferEvents(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const now = new Date();
    const events = await prisma.offerEvent.findMany({
      where: buildPublicOfferEventsWhere(now),
      include: {
        miners: {
          where: { isActive: true },
          orderBy: { id: "asc" }
        }
      },
      orderBy: [{ startsAt: "asc" }, { endsAt: "asc" }]
    });

    let claimMap: Record<number, number> = {};
    if (userId) {
      const allMinerIds = events.flatMap((e) => e.miners.map((m) => m.id));
      if (allMinerIds.length > 0) {
        const claimCounts = await prisma.eventPurchase.groupBy({
          by: ["eventMinerId"],
          where: { userId, eventMinerId: { in: allMinerIds } },
          _count: { id: true }
        });
        claimMap = Object.fromEntries(claimCounts.map((row) => [row.eventMinerId, row._count.id]));
      }
    }

    res.json({
      ok: true,
      events: events.map((e) => serializeEventPublic(e, now, claimMap)),
      serverTime: now.toISOString()
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("listActiveOfferEvents", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Unable to load offer events." });
  }
}

type EventDetailParams = { id: string };

export async function getOfferEventDetail(req: Request<EventDetailParams>, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid event id." });
      return;
    }
    const now = new Date();
    const event = await prisma.offerEvent.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now }
      },
      include: {
        miners: {
          where: { isActive: true },
          orderBy: { id: "asc" }
        }
      }
    });

    if (!event) {
      res.status(404).json({ ok: false, message: "Event not found or not available." });
      return;
    }

    res.json({
      ok: true,
      event: serializeEventPublic(event, now),
      serverTime: now.toISOString()
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("getOfferEventDetail", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Unable to load event." });
  }
}

export async function purchaseOfferMiner(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const eventMinerId = Number((req.body as { eventMinerId?: unknown })?.eventMinerId);
    if (!Number.isInteger(eventMinerId) || eventMinerId <= 0) {
      res.status(400).json({ ok: false, message: "Invalid event miner id." });
      return;
    }

    const bodyQty = (req.body as { quantity?: unknown })?.quantity;
    const quantity = Math.max(1, Math.min(25, parseInt(String(bodyQty ?? 1), 10) || 1));

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await purchaseEventMinerForUser(req.user.id, eventMinerId, quantity);
      if (!out.ok) {
        await cancelCriticalMutation(asIdempotencyLease(lease));
        res.status(out.status || 500).json({ ok: false, message: out.message, code: out.code });
        return;
      }
      const payload = { ok: true, message: out.message, balances: out.balances };
      await finalizeCriticalMutationSuccess(asIdempotencyLease(lease), {
        requestHash: ci.requestHash,
        responseJson: payload
      });
      logUserActivity("FIN_OFFER_EVENT_PURCHASE", req, { eventMinerId, quantity });
      res.json(payload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(asIdempotencyLease(lease));
      if (errCode(inner) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
        return;
      }
      const msg = inner instanceof Error ? inner.message : String(inner);
      logger.error("purchaseOfferMiner", { error: String(msg) });
      res.status(500).json({ ok: false, message: "Purchase failed." });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("purchaseOfferMiner", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Purchase failed." });
  }
}
