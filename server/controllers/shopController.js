import * as minersModel from "../models/minersModel.js";
import prisma from "../src/db/prisma.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { createNotification } from "./notificationController.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { bulkCreateInventoryWithOwnedMachinesTx } from "../services/userOwnedMachineService.js";
import { lockUserRowForUpdate } from "../utils/transactionLocks.js";
import {
  SecurityErrorCodes,
  buildSecurityErrorJson,
  securityMessageKeyForCode,
} from "../utils/securityErrors.js";
import { advisoryXactTryLockOrThrow } from "../services/distributedLockService.js";
import {
  abortIdempotencyLease,
  beginIdempotencyLease,
  commitIdempotencyResult,
} from "../services/idempotencyService.js";
import loggerLib, { logUserActivity } from "../utils/logger.js";
import { logSecurityEvent, logSecurityWarn } from "../utils/securityLogger.js";

const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";
const logger = loggerLib.child("Shop");

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
    logger.error("listMiners error", { message: error?.message }, req);
    res.status(500).json({ ok: false, message: "Unable to load miners." });
  }
}

export async function purchaseMiner(req, res) {
  const ci = req.criticalIdempotency;
  if (!ci?.idempotencyKey || !ci.requestHash) {
    return res.status(500).json({ ok: false, message: "Purchase route is not configured for idempotency." });
  }

  try {
    const minerId = Number(req.body?.minerId);
    const quantity = Number(req.body?.quantity || 1);
    const rawMaxBulk = Number(process.env.SHOP_MAX_BULK_QUANTITY || 25);
    const maxBulk = Number.isInteger(rawMaxBulk) && rawMaxBulk > 0 ? rawMaxBulk : 25;

    logger.info("purchaseMiner attempt", { minerId, quantity }, req);

    if (!Number.isInteger(minerId) || minerId <= 0) {
      logger.warn("purchaseMiner invalid minerId", { minerId }, req);
      res.status(400).json({ ok: false, message: "Invalid miner ID." });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxBulk) {
      logger.warn("purchaseMiner invalid quantity", { minerId, quantity, maxBulk }, req);
      res.status(400).json({ ok: false, message: `Quantity must be between 1 and ${maxBulk}.` });
      return;
    }

    const phase = await beginIdempotencyLease({
      scope: "shop_purchase",
      userId: req.user.id,
      idempotencyKey: ci.idempotencyKey,
      requestHash: ci.requestHash,
    });

    if (phase.type === "mismatch") {
      logSecurityWarn("SHOP_IDEMPOTENCY_MISMATCH", { minerId, quantity }, req);
      return res.status(400).json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_REQUEST_SIGNATURE));
    }
    if (phase.type === "busy") {
      logSecurityWarn("SHOP_IDEMPOTENCY_BUSY", { minerId, quantity }, req);
      return res
        .status(409)
        .json(
          buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED, {
            extra: { reason: "IDEMPOTENCY_IN_FLIGHT" },
          }),
        );
    }
    if (phase.type === "replay") {
      logSecurityEvent("SHOP_IDEMPOTENCY_REPLAY", { minerId, quantity }, req);
      const p = phase.responseJson;
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

    const lease = phase;

    const miner = await minersModel.getActiveMinerById(minerId);
    if (!miner) {
      await abortIdempotencyLease(lease);
      logger.warn("purchaseMiner miner not found", { minerId, quantity }, req);
      res.status(404).json({ ok: false, message: "Miner not found." });
      return;
    }

    const price = Number(miner.price || 0);
    const baseHashRate = Number(miner.baseHashRate || 0);
    const slotSize = Number(miner.slotSize || 1);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(baseHashRate) || baseHashRate <= 0) {
      await abortIdempotencyLease(lease);
      logger.error("purchaseMiner invalid miner data", { minerId, quantity, price, baseHashRate }, req);
      res.status(500).json({ ok: false, message: "Miner data invalid." });
      return;
    }

    if (!Number.isInteger(slotSize) || slotSize < 1 || slotSize > 2) {
      await abortIdempotencyLease(lease);
      logger.error("purchaseMiner invalid slot size", { minerId, quantity, slotSize }, req);
      res.status(500).json({ ok: false, message: "Miner slot size invalid." });
      return;
    }

    const now = new Date();

    let txResult;
    try {
      txResult = await prisma.$transaction(async (tx) => {
        await advisoryXactTryLockOrThrow(tx, `shop_purchase:${req.user.id}`);
        await lockUserRowForUpdate(tx, req.user.id);

          const currentMiner = await tx.miner.findFirst({
            where: {
              id: miner.id,
              isActive: true,
              showInShop: true,
              isArchived: false,
              sourceType: "store",
              faucetReward: null,
              shortlinkRew: null,
            },
          });
          if (!currentMiner) throw new Error("Miner unavailable.");
          const currentPrice = Number(currentMiner.price || 0);
          const currentTotalPrice = currentPrice * quantity;
          const currentHashRate = Number(currentMiner.baseHashRate || 0);
          const currentSlotSize = Number(currentMiner.slotSize || 1);
          if (currentMiner.stockTotal != null && Number(currentMiner.stockSold || 0) + quantity > Number(currentMiner.stockTotal)) {
            throw new Error("Miner out of stock.");
          }
          if (currentMiner.maxPerUser != null) {
            const ownedCount = await tx.userOwnedMachine.count({ where: { userId: req.user.id, minerId: miner.id } });
            if (ownedCount + quantity > Number(currentMiner.maxPerUser)) throw new Error("Miner purchase limit reached.");
          }

          const user = await tx.user.findUnique({ where: { id: req.user.id } });
          const balanceBefore = Number(user?.polBalance || 0);
          if (!user || balanceBefore < currentTotalPrice) {
            throw new Error("Insufficient balance.");
          }

          const newUser = await tx.user.update({
            where: { id: req.user.id },
            data: { polBalance: { decrement: currentTotalPrice } },
          });

          await bulkCreateInventoryWithOwnedMachinesTx(
            tx,
            req.user.id,
            {
              minerId: miner.id,
              minerName: currentMiner.name,
              level: 1,
              hashRate: currentHashRate,
              slotSize: currentSlotSize,
              imageUrl: currentMiner.imageUrl || DEFAULT_MINER_IMAGE_URL,
              snapshotSlug: currentMiner.slug,
              snapshotPrice: currentPrice,
              acquisitionSource: "shop",
            },
            quantity,
            now,
          );

          await tx.miner.update({
            where: { id: miner.id },
            data: { stockSold: { increment: quantity } },
          });

        return {
          newUser,
          balanceBefore,
          minerName: currentMiner.name,
          unitPrice: currentPrice,
          totalPrice: currentTotalPrice,
        };
      });
    } catch (error) {
      await abortIdempotencyLease(lease);
      if (["Miner unavailable.", "Miner out of stock.", "Miner purchase limit reached."].includes(error.message)) {
        logger.warn("purchaseMiner rejected", { minerId, quantity, reason: error.message }, req);
        return res.status(400).json({ ok: false, message: error.message });
      }
      if (error.message === "Insufficient balance.") {
        logger.warn("purchaseMiner insufficient balance", { minerId, quantity }, req);
        return res.status(400).json({ ok: false, message: "Insufficient balance." });
      }
      if (error?.code === "P2034") {
        logSecurityWarn("SHOP_PURCHASE_TX_CONFLICT", { minerId, quantity, prismaCode: error.code }, req);
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      if (error?.code === "DISTRIBUTED_LOCK_BUSY") {
        logSecurityWarn("SHOP_PURCHASE_LOCK_BUSY", { minerId, quantity }, req);
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      logger.error("purchaseMiner transaction error", { minerId, quantity, message: error?.message, code: error?.code }, req);
      return res.status(500).json({ ok: false, message: "Purchase error." });
    }

    const replayPayload = {
      newBalance: Number(txResult.newUser?.polBalance || 0),
      quantity,
      minerName: txResult.minerName,
      totalPrice: txResult.totalPrice,
    };
    await commitIdempotencyResult(lease, { requestHash: ci.requestHash, responseJson: replayPayload });

    applyUserBalanceDelta(req.user.id, -txResult.totalPrice);

    await createNotification({
      userId: req.user.id,
      title: "Purchase complete",
      message: `You bought ${quantity}x ${txResult.minerName} for ${txResult.totalPrice} POL. Items are in your inventory.`,
      type: "success",
      io: getMiningEngine()?.io,
    });

    logUserActivity("FIN_SHOP_PURCHASE", req, {
      minerId,
      minerName: txResult.minerName,
      quantity,
      unitPrice: txResult.unitPrice,
      totalPrice: txResult.totalPrice,
      balanceBefore: txResult.balanceBefore,
      newBalance: Number(txResult.newUser?.polBalance || 0),
    });
    logger.info(
      "purchaseMiner success",
      {
        minerId,
        minerName: txResult.minerName,
        quantity,
        unitPrice: txResult.unitPrice,
        totalPrice: txResult.totalPrice,
        balanceBefore: txResult.balanceBefore,
        newBalance: Number(txResult.newUser?.polBalance || 0),
      },
      req,
    );

    res.json({
      ok: true,
      message: `${quantity}x ${txResult.minerName} added to your inventory!`,
      newBalance: Number(txResult.newUser?.polBalance || 0),
    });
  } catch (error) {
    logger.error("purchaseMiner fatal error", { message: error?.message, code: error?.code }, req);
    res.status(500).json({ ok: false, message: "Purchase error." });
  }
}
