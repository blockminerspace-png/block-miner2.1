import prisma from "../src/db/prisma.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { createNotification } from "../controllers/notificationController.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import {
  getUserBalanceNumber,
  hasEventMinerStock,
  isOfferEventLiveAt,
  normalizeOfferCurrency,
  userBalanceFieldForCurrency
} from "./offerEventHelpers.js";

const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";

async function incrementSoldCountOptimistic(tx, minerId, quantity = 1) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const m = await tx.eventMiner.findUnique({ where: { id: minerId } });
    if (!m) {
      const err = new Error("MINER_NOT_FOUND");
      err.code = "NOT_FOUND";
      throw err;
    }
    if (!m.stockUnlimited) {
      const remaining = (m.stockCount || 0) - (m.soldCount || 0);
      if (remaining < quantity) {
        const err = new Error("OUT_OF_STOCK");
        err.code = "OUT_OF_STOCK";
        throw err;
      }
    }
    const res = await tx.eventMiner.updateMany({
      where: { id: minerId, soldCount: m.soldCount },
      data: { soldCount: { increment: quantity } }
    });
    if (res.count === 1) return m;
  }
  const err = new Error("STOCK_BUSY");
  err.code = "CONFLICT";
  throw err;
}

function mapBalances(user) {
  if (!user) return {};
  return {
    polBalance: Number(user.polBalance ?? 0),
    btcBalance: Number(user.btcBalance ?? 0),
    ethBalance: Number(user.ethBalance ?? 0),
    usdtBalance: Number(user.usdtBalance ?? 0),
    usdcBalance: Number(user.usdcBalance ?? 0),
    zerBalance: Number(user.zerBalance ?? 0)
  };
}

/**
 * @returns {Promise<{ ok: true, message: string, balances: object } | { ok: false, code: string, message: string, status: number }>}
 */
export async function purchaseEventMinerForUser(userId, eventMinerId, quantity = 1) {
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const em = await tx.eventMiner.findUnique({
        where: { id: eventMinerId },
        include: { event: true }
      });

      if (!em || !em.event || em.event.deletedAt) {
        const err = new Error("MINER_NOT_FOUND");
        err.code = "NOT_FOUND";
        throw err;
      }

      if (!isOfferEventLiveAt(now, em.event)) {
        const err = new Error("EVENT_NOT_ACTIVE");
        err.code = "EXPIRED";
        throw err;
      }

      if (!em.isActive || !hasEventMinerStock(em)) {
        const err = new Error("MINER_UNAVAILABLE");
        err.code = "UNAVAILABLE";
        throw err;
      }

      const currency = normalizeOfferCurrency(em.currency);
      const slotSize = Number.isInteger(em.slotSize) && em.slotSize >= 1 && em.slotSize <= 2 ? em.slotSize : 1;
      let totalPrice = 0;

      if (em.isFree) {
        // Check per-user claim limit
        if (em.claimLimitPerUser > 0) {
          const existingClaims = await tx.eventPurchase.count({
            where: { userId, eventMinerId: em.id }
          });
          if (existingClaims + quantity > em.claimLimitPerUser) {
            const err = new Error("CLAIM_LIMIT_EXCEEDED");
            err.code = "CLAIM_LIMIT_EXCEEDED";
            throw err;
          }
        }

        await incrementSoldCountOptimistic(tx, em.id, quantity);

        await tx.eventPurchase.createMany({
          data: Array.from({ length: quantity }, () => ({
            userId,
            eventId: em.eventId,
            eventMinerId: em.id,
            pricePaid: 0,
            currency
          }))
        });
      } else {
        const price = Number(em.price);
        if (!Number.isFinite(price) || price <= 0) {
          const err = new Error("INVALID_PRICE");
          err.code = "SERVER";
          throw err;
        }

        totalPrice = price * quantity;
        const balanceField = userBalanceFieldForCurrency(currency);

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          const err = new Error("USER_NOT_FOUND");
          err.code = "NOT_FOUND";
          throw err;
        }

        if (getUserBalanceNumber(user, currency) < totalPrice) {
          const err = new Error("INSUFFICIENT_BALANCE");
          err.code = "INSUFFICIENT";
          throw err;
        }

        await incrementSoldCountOptimistic(tx, em.id, quantity);

        await tx.user.update({
          where: { id: userId },
          data: { [balanceField]: { decrement: totalPrice } }
        });

        await tx.eventPurchase.createMany({
          data: Array.from({ length: quantity }, () => ({
            userId,
            eventId: em.eventId,
            eventMinerId: em.id,
            pricePaid: em.price,
            currency
          }))
        });
      }

      await tx.userInventory.createMany({
        data: Array.from({ length: quantity }, () => ({
          userId,
          minerId: null,
          minerName: `[Event] ${em.name}`,
          level: 1,
          hashRate: em.hashRate,
          slotSize,
          imageUrl: em.imageUrl || DEFAULT_MINER_IMAGE_URL,
          acquiredAt: now,
          updatedAt: now
        }))
      });

      const updatedUser = await tx.user.findUnique({ where: { id: userId } });
      return {
        minerName: em.name,
        eventTitle: em.event.title,
        currency,
        isFree: em.isFree,
        price: em.isFree ? 0 : Number(em.price),
        totalPrice,
        updatedUser
      };
    });

    const { minerName, eventTitle, currency, isFree, totalPrice, updatedUser } = result;

    if (!isFree && currency === "POL") {
      applyUserBalanceDelta(userId, -totalPrice);
    }

    await createNotification({
      userId,
      title: isFree ? "Maquina gratis coletada!" : "Oferta especial",
      message: isFree
        ? `Voce coletou ${quantity}x ${minerName} gratuitamente! ${quantity > 1 ? 'Os equipamentos estao' : 'O equipamento esta'} no inventario!`
        : `Voce comprou ${quantity}x ${minerName} no evento "${eventTitle}". ${quantity > 1 ? 'Os equipamentos estao' : 'O equipamento esta'} no inventario!`,
      type: "success",
      io: getMiningEngine()?.io
    });

    return {
      ok: true,
      message: `${quantity}x ${minerName} adicionado(s) ao inventario.`,
      balances: mapBalances(updatedUser)
    };
  } catch (e) {
    const code = e.code || e.message;
    if (code === "NOT_FOUND" || e.message === "MINER_NOT_FOUND" || e.message === "USER_NOT_FOUND") {
      return { ok: false, status: 404, code: "not_found", message: "Miner or event not found." };
    }
    if (e.message === "INSUFFICIENT_BALANCE") {
      return { ok: false, status: 400, code: "insufficient_balance", message: "Insufficient balance." };
    }
    if (e.message === "CLAIM_LIMIT_EXCEEDED") {
      return { ok: false, status: 400, code: "claim_limit_exceeded", message: "Limite de coletas atingido para esta maquina." };
    }
    if (e.message === "OUT_OF_STOCK" || e.message === "MINER_UNAVAILABLE") {
      return { ok: false, status: 400, code: "out_of_stock", message: "This offer is sold out or unavailable." };
    }
    if (e.message === "EVENT_NOT_ACTIVE") {
      return { ok: false, status: 400, code: "event_expired", message: "This event is not active." };
    }
    if (e.message === "STOCK_BUSY") {
      return { ok: false, status: 409, code: "retry", message: "Please try again." };
    }
    console.error("purchaseEventMinerForUser:", e);
    return { ok: false, status: 500, code: "error", message: "Purchase failed." };
  }
}
