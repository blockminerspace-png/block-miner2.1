import * as minersModel from "../models/minersModel.js";
import prisma from "../src/db/prisma.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { createNotification } from "./notificationController.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { bulkCreateInventoryWithOwnedMachinesTx } from "../services/userOwnedMachineService.js";
import { lockUserRowForUpdate } from "../utils/transactionLocks.js";
import {
  getShopIdempotencyPayload,
  normalizeShopIdempotencyKey,
  setShopIdempotencyPayload,
} from "../services/shopIdempotencyStore.js";
import {
  SecurityErrorCodes,
  buildSecurityErrorJson,
  securityMessageKeyForCode,
} from "../utils/securityErrors.js";

const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";

export async function listMiners(req, res) {
  try {
    const rawPage = Number(req.query?.page || 1);
    const rawPageSize = Number(req.query?.pageSize || 24);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isInteger(rawPageSize) ? Math.min(Math.max(rawPageSize, 6), 48) : 24;

    const { miners, total } = await minersModel.listActiveMiners(page, pageSize);
    const items = miners.map((miner) => ({
      id: miner.id,
      name: miner.name,
      baseHashRate: Number(miner.baseHashRate || 0),
      slotSize: Number(miner.slotSize || 1),
      price: Number(miner.price || 0),
      imageUrl: miner.imageUrl || DEFAULT_MINER_IMAGE_URL,
    }));

    res.json({
      ok: true,
      page,
      pageSize,
      total,
      miners: items,
    });
  } catch (error) {
    console.error("Error loading miners:", error);
    res.status(500).json({ ok: false, message: "Unable to load miners." });
  }
}

export async function purchaseMiner(req, res) {
  try {
    const minerId = Number(req.body?.minerId);
    const quantity = Number(req.body?.quantity || 1);
    const maxBulk = Number(process.env.SHOP_MAX_BULK_QUANTITY || 25);
    const rawKey = req.get("Idempotency-Key") || req.get("idempotency-key") || req.body?.idempotencyKey;
    const idempotencyKey = normalizeShopIdempotencyKey(rawKey);

    if (rawKey != null && String(rawKey).trim() !== "" && !idempotencyKey) {
      return res
        .status(400)
        .json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "idempotencyKey" } }));
    }

    if (!Number.isInteger(minerId) || minerId <= 0) {
      res.status(400).json({ ok: false, message: "Invalid miner ID." });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxBulk) {
      res.status(400).json({ ok: false, message: `Quantity must be between 1 and ${maxBulk}.` });
      return;
    }

    const miner = await minersModel.getActiveMinerById(minerId);
    if (!miner) {
      res.status(404).json({ ok: false, message: "Miner not found." });
      return;
    }

    const price = Number(miner.price || 0);
    const totalPrice = price * quantity;
    const baseHashRate = Number(miner.baseHashRate || 0);
    const slotSize = Number(miner.slotSize || 1);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(baseHashRate) || baseHashRate <= 0) {
      res.status(500).json({ ok: false, message: "Miner data invalid." });
      return;
    }

    if (!Number.isInteger(slotSize) || slotSize < 1 || slotSize > 2) {
      res.status(500).json({ ok: false, message: "Miner slot size invalid." });
      return;
    }

    const now = new Date();

    const txResult = await prisma.$transaction(async (tx) => {
      await lockUserRowForUpdate(tx, req.user.id);

      if (idempotencyKey) {
        const cached = getShopIdempotencyPayload(req.user.id, idempotencyKey);
        if (cached) {
          return { kind: "replay", payload: cached };
        }
      }

      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      if (!user || Number(user.polBalance) < totalPrice) {
        throw new Error("Insufficient balance.");
      }

      const newUser = await tx.user.update({
        where: { id: req.user.id },
        data: { polBalance: { decrement: totalPrice } },
      });

      await bulkCreateInventoryWithOwnedMachinesTx(
        tx,
        req.user.id,
        {
          minerId: miner.id,
          minerName: miner.name,
          level: 1,
          hashRate: baseHashRate,
          slotSize,
          imageUrl: miner.imageUrl || DEFAULT_MINER_IMAGE_URL,
        },
        quantity,
        now,
      );

      return {
        kind: "purchase",
        newUser,
        minerName: miner.name,
        totalPrice,
      };
    });

    if (txResult.kind === "replay") {
      const p = txResult.payload;
      return res.json({
        ok: true,
        idempotent: true,
        code: SecurityErrorCodes.IDEMPOTENT_REPLAY,
        messageKey: securityMessageKeyForCode(SecurityErrorCodes.IDEMPOTENT_REPLAY),
        message:
          "This purchase was already processed successfully; returning the same result without charging again.",
        newBalance: p.newBalance,
        quantity: p.quantity,
        minerName: p.minerName,
        totalPrice: p.totalPrice,
      });
    }

    if (idempotencyKey) {
      setShopIdempotencyPayload(req.user.id, idempotencyKey, {
        newBalance: Number(txResult.newUser?.polBalance || 0),
        quantity,
        minerName: txResult.minerName,
        totalPrice: txResult.totalPrice,
      });
    }

    applyUserBalanceDelta(req.user.id, -txResult.totalPrice);

    await createNotification({
      userId: req.user.id,
      title: "Purchase complete",
      message: `You bought ${quantity}x ${txResult.minerName} for ${txResult.totalPrice} POL. Items are in your inventory.`,
      type: "success",
      io: getMiningEngine()?.io,
    });

    res.json({
      ok: true,
      message: `${quantity}x ${txResult.minerName} added to your inventory!`,
      newBalance: Number(txResult.newUser?.polBalance || 0),
    });
  } catch (error) {
    if (error.message === "Insufficient balance.") {
      return res.status(400).json({ ok: false, message: "Insufficient balance." });
    }
    if (error?.code === "P2034") {
      return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    }
    console.error("Error purchasing miner:", error);
    res.status(500).json({ ok: false, message: "Purchase error." });
  }
}
