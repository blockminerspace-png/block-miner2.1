import prisma from "../src/db/prisma.js";
import { isOfferEventActiveForPublic, hasEventMinerStock } from "../services/offerEventHelpers.js";
import { purchaseEventMinerForUser } from "../services/offerEventPurchaseService.js";

function serializeMinerPublic(m, claimMap = {}) {
  const remaining =
    m.stockUnlimited || m.stockCount == null ? null : Math.max(0, (m.stockCount || 0) - (m.soldCount || 0));
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

function serializeEventPublic(e, now, claimMap = {}) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    imageUrl: e.imageUrl,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    isActive: e.isActive,
    miners: (e.miners || []).map((m) => serializeMinerPublic(m, claimMap)),
    isLive: isOfferEventActiveForPublic(now, e)
  };
}

export async function listActiveOfferEvents(req, res) {
  try {
    const userId = req.user?.id;
    const now = new Date();
    const events = await prisma.offerEvent.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        endsAt: { gte: now }
      },
      include: {
        miners: {
          where: { isActive: true },
          orderBy: { id: "asc" }
        }
      },
      orderBy: { endsAt: "asc" }
    });

    let claimMap = {};
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
  } catch (e) {
    console.error("listActiveOfferEvents", e);
    res.status(500).json({ ok: false, message: "Unable to load offer events." });
  }
}

export async function getOfferEventDetail(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid event id." });
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
      return res.status(404).json({ ok: false, message: "Event not found or not available." });
    }

    res.json({
      ok: true,
      event: serializeEventPublic(event, now),
      serverTime: now.toISOString()
    });
  } catch (e) {
    console.error("getOfferEventDetail", e);
    res.status(500).json({ ok: false, message: "Unable to load event." });
  }
}

export async function purchaseOfferMiner(req, res) {
  try {
    const eventMinerId = Number(req.body?.eventMinerId);
    if (!Number.isInteger(eventMinerId) || eventMinerId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid event miner id." });
    }

    const quantity = Math.max(1, Math.min(25, parseInt(req.body?.quantity || 1) || 1));

    const out = await purchaseEventMinerForUser(req.user.id, eventMinerId, quantity);
    if (!out.ok) {
      return res.status(out.status || 500).json({ ok: false, message: out.message, code: out.code });
    }

    res.json({ ok: true, message: out.message, balances: out.balances });
  } catch (e) {
    console.error("purchaseOfferMiner", e);
    res.status(500).json({ ok: false, message: "Purchase failed." });
  }
}
