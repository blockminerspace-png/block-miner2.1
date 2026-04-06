import { z } from "zod";
import prisma from "../src/db/prisma.js";

const eventCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20000),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isActive: z.boolean().optional()
  })
  .strict();

const eventUpdateSchema = eventCreateSchema.partial();

const minerCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20000),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    price: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]),
    hashRate: z.number().positive(),
    currency: z.enum(["POL", "BTC", "ETH", "USDT", "USDC", "ZER"]).optional(),
    stockUnlimited: z.boolean(),
    stockCount: z.number().int().positive().optional().nullable(),
    slotSize: z.union([z.literal(1), z.literal(2)]).optional(),
    isActive: z.boolean().optional(),
    isFree: z.boolean().optional(),
    claimLimitPerUser: z.number().int().min(0).optional()
  })
  .strict()
  .refine((d) => d.stockUnlimited || (d.stockCount != null && d.stockCount > 0), {
    message: "stockCount required when stock is limited"
  });

const minerUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(20000).optional(),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    price: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]).optional(),
    hashRate: z.number().positive().optional(),
    currency: z.enum(["POL", "BTC", "ETH", "USDT", "USDC", "ZER"]).optional(),
    stockUnlimited: z.boolean().optional(),
    stockCount: z.number().int().positive().optional().nullable(),
    slotSize: z.union([z.literal(1), z.literal(2)]).optional(),
    isActive: z.boolean().optional(),
    isFree: z.boolean().optional(),
    claimLimitPerUser: z.number().int().min(0).optional()
  })
  .strict();

export { eventCreateSchema, eventUpdateSchema, minerCreateSchema, minerUpdateSchema };

function toDecimalPrice(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid price");
  return String(n);
}

const listEventsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(5).max(100).optional(),
    includeDeleted: z.enum(["0", "1"]).optional()
  })
  .strict();

const listPurchasesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(5).max(200).optional()
  })
  .strict();

export async function adminListOfferEvents(req, res) {
  try {
    const q = listEventsQuerySchema.safeParse(req.query || {});
    if (!q.success) {
      return res.status(400).json({ ok: false, message: "Invalid query.", errors: q.error.issues });
    }
    const page = Math.max(1, q.data.page ?? 1);
    const pageSize = Math.min(100, Math.max(5, q.data.pageSize ?? 20));
    const skip = (page - 1) * pageSize;
    const includeDeleted = q.data.includeDeleted === "1";

    const where = includeDeleted ? {} : { deletedAt: null };

    const [items, total] = await Promise.all([
      prisma.offerEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { id: "desc" },
        include: {
          _count: { select: { miners: true, purchases: true } }
        }
      }),
      prisma.offerEvent.count({ where })
    ]);

    res.json({
      ok: true,
      page,
      pageSize,
      total,
      events: items.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        imageUrl: e.imageUrl,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        isActive: e.isActive,
        deletedAt: e.deletedAt,
        minerCount: e._count.miners,
        purchaseCount: e._count.purchases
      }))
    });
  } catch (e) {
    console.error("adminListOfferEvents", e);
    res.status(500).json({ ok: false, message: "Error listing events." });
  }
}

export async function adminCreateOfferEvent(req, res) {
  try {
    const d = eventCreateSchema.parse(req.body);
    const startsAt = d.startsAt instanceof Date ? d.startsAt : new Date(d.startsAt);
    const endsAt = d.endsAt instanceof Date ? d.endsAt : new Date(d.endsAt);
    if (endsAt <= startsAt) {
      return res.status(400).json({ ok: false, message: "endsAt must be after startsAt." });
    }

    const event = await prisma.offerEvent.create({
      data: {
        title: d.title,
        description: d.description,
        imageUrl: d.imageUrl || null,
        startsAt,
        endsAt,
        isActive: d.isActive !== false
      }
    });

    res.json({ ok: true, event });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
    }
    console.error("adminCreateOfferEvent", e);
    res.status(500).json({ ok: false, message: "Error creating event." });
  }
}

export async function adminGetOfferEvent(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    const event = await prisma.offerEvent.findFirst({
      where: { id },
      include: {
        _count: { select: { miners: true, purchases: true } }
      }
    });
    if (!event) return res.status(404).json({ ok: false, message: "Not found." });
    res.json({ ok: true, event });
  } catch (e) {
    console.error("adminGetOfferEvent", e);
    res.status(500).json({ ok: false, message: "Error." });
  }
}

export async function adminUpdateOfferEvent(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    const d = eventUpdateSchema.parse(req.body);
    const existing = await prisma.offerEvent.findFirst({ where: { id } });
    if (!existing) return res.status(404).json({ ok: false, message: "Not found." });

    const startsAt = d.startsAt != null ? (d.startsAt instanceof Date ? d.startsAt : new Date(d.startsAt)) : existing.startsAt;
    const endsAt = d.endsAt != null ? (d.endsAt instanceof Date ? d.endsAt : new Date(d.endsAt)) : existing.endsAt;
    if (endsAt <= startsAt) {
      return res.status(400).json({ ok: false, message: "endsAt must be after startsAt." });
    }

    const event = await prisma.offerEvent.update({
      where: { id },
      data: {
        ...(d.title != null && { title: d.title }),
        ...(d.description != null && { description: d.description }),
        ...(d.imageUrl !== undefined && { imageUrl: d.imageUrl || null }),
        startsAt,
        endsAt,
        ...(d.isActive != null && { isActive: d.isActive })
      }
    });

    res.json({ ok: true, event });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
    }
    console.error("adminUpdateOfferEvent", e);
    res.status(500).json({ ok: false, message: "Error updating event." });
  }
}

export async function adminSoftDeleteOfferEvent(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    await prisma.offerEvent.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("adminSoftDeleteOfferEvent", e);
    res.status(500).json({ ok: false, message: "Error deleting event." });
  }
}

export async function adminListEventMiners(req, res) {
  try {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid event id." });
    }
    const event = await prisma.offerEvent.findFirst({ where: { id: eventId } });
    if (!event) return res.status(404).json({ ok: false, message: "Event not found." });

    const miners = await prisma.eventMiner.findMany({
      where: { eventId },
      orderBy: { id: "asc" }
    });

    res.json({ ok: true, event, miners });
  } catch (e) {
    console.error("adminListEventMiners", e);
    res.status(500).json({ ok: false, message: "Error." });
  }
}

export async function adminCreateEventMiner(req, res) {
  try {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid event id." });
    }
    const event = await prisma.offerEvent.findFirst({ where: { id: eventId } });
    if (!event) return res.status(404).json({ ok: false, message: "Event not found." });

    const d = minerCreateSchema.parse(req.body);
    const price = toDecimalPrice(d.price);

    const miner = await prisma.eventMiner.create({
      data: {
        eventId,
        name: d.name,
        description: d.description,
        imageUrl: d.imageUrl || null,
        price,
        hashRate: d.hashRate,
        currency: d.currency || "POL",
        stockUnlimited: d.stockUnlimited,
        stockCount: d.stockUnlimited ? null : d.stockCount,
        slotSize: d.slotSize ?? 1,
        isActive: d.isActive !== false,
        isFree: d.isFree === true,
        claimLimitPerUser: d.claimLimitPerUser ?? 1
      }
    });

    res.json({ ok: true, miner });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
    }
    console.error("adminCreateEventMiner", e);
    res.status(500).json({ ok: false, message: "Error creating miner." });
  }
}

export async function adminUpdateEventMiner(req, res) {
  try {
    const eventId = Number(req.params.eventId);
    const minerId = Number(req.params.minerId);
    if (!Number.isInteger(eventId) || !Number.isInteger(minerId)) {
      return res.status(400).json({ ok: false, message: "Invalid ids." });
    }

    const existing = await prisma.eventMiner.findFirst({
      where: { id: minerId, eventId }
    });
    if (!existing) return res.status(404).json({ ok: false, message: "Miner not found." });

    const d = minerUpdateSchema.parse(req.body);

    let price = undefined;
    if (d.price != null) price = toDecimalPrice(d.price);

    const stockUnlimited = d.stockUnlimited !== undefined ? d.stockUnlimited : existing.stockUnlimited;
    const stockCount =
      d.stockCount !== undefined ? d.stockCount : d.stockUnlimited !== undefined && stockUnlimited ? null : existing.stockCount;

    const miner = await prisma.eventMiner.update({
      where: { id: minerId },
      data: {
        ...(d.name != null && { name: d.name }),
        ...(d.description != null && { description: d.description }),
        ...(d.imageUrl !== undefined && { imageUrl: d.imageUrl || null }),
        ...(price != null && { price }),
        ...(d.hashRate != null && { hashRate: d.hashRate }),
        ...(d.currency != null && { currency: d.currency }),
        ...(d.stockUnlimited !== undefined && { stockUnlimited: d.stockUnlimited }),
        ...(d.stockCount !== undefined || d.stockUnlimited !== undefined
          ? {
              stockCount: stockUnlimited ? null : stockCount
            }
          : {}),
        ...(d.slotSize != null && { slotSize: d.slotSize }),
        ...(d.isActive != null && { isActive: d.isActive }),
        ...(d.isFree !== undefined && { isFree: d.isFree }),
        ...(d.claimLimitPerUser !== undefined && { claimLimitPerUser: d.claimLimitPerUser })
      }
    });

    res.json({ ok: true, miner });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
    }
    console.error("adminUpdateEventMiner", e);
    res.status(500).json({ ok: false, message: "Error updating miner." });
  }
}

export async function adminRemoveEventMiner(req, res) {
  try {
    const eventId = Number(req.params.eventId);
    const minerId = Number(req.params.minerId);
    const existing = await prisma.eventMiner.findFirst({
      where: { id: minerId, eventId },
      include: { _count: { select: { purchases: true } } }
    });
    if (!existing) return res.status(404).json({ ok: false, message: "Miner not found." });

    if (existing._count.purchases > 0) {
      await prisma.eventMiner.update({
        where: { id: minerId },
        data: { isActive: false }
      });
      return res.json({ ok: true, deactivated: true });
    }

    await prisma.eventMiner.delete({ where: { id: minerId } });
    res.json({ ok: true, deleted: true });
  } catch (e) {
    console.error("adminRemoveEventMiner", e);
    res.status(500).json({ ok: false, message: "Error removing miner." });
  }
}

export async function adminListEventPurchases(req, res) {
  try {
    const eventId = Number(req.params.id);
    const q = listPurchasesQuerySchema.safeParse(req.query || {});
    if (!q.success) {
      return res.status(400).json({ ok: false, message: "Invalid query.", errors: q.error.issues });
    }
    const page = Math.max(1, q.data.page ?? 1);
    const pageSize = Math.min(200, Math.max(5, q.data.pageSize ?? 50));
    const skip = (page - 1) * pageSize;

    const event = await prisma.offerEvent.findFirst({ where: { id: eventId } });
    if (!event) return res.status(404).json({ ok: false, message: "Event not found." });

    const [purchases, total] = await Promise.all([
      prisma.eventPurchase.findMany({
        where: { eventId },
        skip,
        take: pageSize,
        orderBy: { id: "desc" },
        include: {
          user: { select: { id: true, email: true, username: true, name: true } },
          eventMiner: { select: { id: true, name: true } }
        }
      }),
      prisma.eventPurchase.count({ where: { eventId } })
    ]);

    res.json({
      ok: true,
      page,
      pageSize,
      total,
      purchases: purchases.map((p) => ({
        id: p.id,
        userId: p.userId,
        eventMinerId: p.eventMinerId,
        pricePaid: Number(p.pricePaid),
        currency: p.currency,
        createdAt: p.createdAt,
        user: p.user,
        minerName: p.eventMiner?.name
      }))
    });
  } catch (e) {
    console.error("adminListEventPurchases", e);
    res.status(500).json({ ok: false, message: "Error listing purchases." });
  }
}
