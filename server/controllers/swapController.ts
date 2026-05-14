import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import { createAuditLog } from "../models/auditLogModel.js";
import { getAnonymizedRequestIp } from "../utils/clientIp.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import type { Prisma } from "@prisma/client";

const PRICE_TTL_MS = 2 * 60 * 1000;
const priceCache = new Map<string, { price: number; timestamp: number }>();

type CoinGeckoPolPriceResponse = {
  "polygon-ecosystem-token"?: { usd?: number };
};

async function getPolUsdPrice(): Promise<number> {
  const cached = priceCache.get("POL");
  if (cached && Date.now() - cached.timestamp < PRICE_TTL_MS) return cached.price;

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd"
    );
    const data = (await res.json()) as CoinGeckoPolPriceResponse;
    const price = data["polygon-ecosystem-token"]?.usd;
    if (typeof price === "number" && Number.isFinite(price)) {
      priceCache.set("POL", { price, timestamp: Date.now() });
      return price;
    }
  } catch (_e: unknown) {
    // Fallback to 1.0 (legacy)
  }
  return 1.0;
}

type SwapBody = {
  fromAsset?: string;
  toAsset?: string;
  amount?: unknown;
};

export async function getBalances(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({
      ok: true,
      balances: {
        POL: Number(user!.polBalance || 0),
        USDC: Number(user!.usdcBalance || 0),
      },
    });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

export async function executeSwap(req: Request<unknown, unknown, SwapBody>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    const userId = req.user.id;
    const { fromAsset, toAsset, amount } = req.body;
    const amountNum = Number(amount);
    const price = await getPolUsdPrice();
    const rate = price;
    const output = fromAsset === "POL" ? amountNum * rate : amountNum / rate;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({ where: { id: userId } });

      if (fromAsset === "POL") {
        if (Number(user!.polBalance) < amountNum) throw new Error("Insufficient POL balance");
        await tx.user.update({
          where: { id: userId },
          data: { polBalance: { decrement: amountNum }, usdcBalance: { increment: output } },
        });
        applyUserBalanceDelta(userId, -amountNum);
      } else {
        if (Number(user!.usdcBalance) < amountNum) throw new Error("Insufficient USDC balance");
        await tx.user.update({
          where: { id: userId },
          data: { usdcBalance: { decrement: amountNum }, polBalance: { increment: output } },
        });
        applyUserBalanceDelta(userId, output);
      }

      await createAuditLog({
        userId,
        action: "swap",
        ip: getAnonymizedRequestIp(req),
        userAgent: req.get("user-agent"),
        label: undefined,
        description: undefined,
        relatedEntityType: undefined,
        relatedEntityId: undefined,
        actorAdminId: undefined,
        details: {
          fromAsset: fromAsset ?? "",
          toAsset: toAsset ?? "",
          amount: amountNum,
          output,
          rate,
        },
      });
    });

    res.json({ ok: true, rate, output });
  } catch (e: unknown) {
    res.status(400).json({
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
