import type { Request, Response } from "express";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../../utils/securityErrors.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../../utils/criticalMutationIdempotency.js";
import { prismaSafeErrorMeta } from "../../utils/prismaSafeError.js";
import {
  readErrorCode,
  readErrorMessage,
  readHttpStatus,
  requireSessionUser,
} from "../../controllers/controllerHttpStatusError.js";
import { INVENTORY_ERROR } from "./inventory.errors.js";
import * as inventoryService from "./inventory.service.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("inventory.controller");

export async function getInventory(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const inventory = await inventoryService.listInventoryForUser(user.id);
    res.json({ ok: true, inventory });
  } catch (err: unknown) {
    logger.error("getInventory failed", { error: String(prismaSafeErrorMeta(err)) });
    res.status(500).json({ ok: false, message: "Unable to load inventory." });
  }
}

export async function installInventoryItem(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const slotIndex = Number(req.body?.slotIndex);
    const inventoryId = Number(req.body?.inventoryId);

    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 80) {
      return res.status(400).json(
        buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "slotIndex" } }),
      );
    }

    if (!Number.isInteger(inventoryId) || inventoryId < 1) {
      return res.status(400).json(
        buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "inventoryId" } }),
      );
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await inventoryService.installInventoryItemForUser(user.id, slotIndex, inventoryId);
      const payload = { ok: true, message: "Machine installed successfully!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      const msg = readErrorMessage(error);
      const http = readHttpStatus(error);
      if (msg === INVENTORY_ERROR.NOT_FOUND || http === 404) {
        return res.status(404).json({ ok: false, message: "Item not found in inventory." });
      }
      if (msg === INVENTORY_ERROR.INVALID_SLOT) {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Large machines must start on an even slot (1, 3, 5, 7 on UI).",
        });
      }
      const errCode = readErrorCode(error);
      if (errCode === "P2034" || errCode === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      logger.error("Install Error:", { error: String(prismaSafeErrorMeta(error)) });
      return res.status(500).json({ ok: false, message: "Internal server error during installation." });
    }
  } catch (error: unknown) {
    logger.error("Install Error:", { error: String(prismaSafeErrorMeta(error)) });
    res.status(500).json({ ok: false, message: "Internal server error during installation." });
  }
}

export async function removeInventoryItem(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const inventoryId = Number(req.body?.inventoryId);
    if (!Number.isInteger(inventoryId) || inventoryId < 1) {
      return res.status(400).json(
        buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "inventoryId" } }),
      );
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await inventoryService.removeInventoryItemForUser(user.id, inventoryId);
      const payload = { ok: true, message: "Item removed." };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorMessage(error) === INVENTORY_ERROR.NOT_FOUND || readHttpStatus(error) === 404) {
        return res.status(404).json({ ok: false, message: "Item not found." });
      }
      const errCode = readErrorCode(error);
      if (errCode === "P2034" || errCode === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      logger.error("removeInventoryItem failed", { error: String(prismaSafeErrorMeta(error)) });
      return res.status(500).json({ ok: false, message: "Error removing item." });
    }
  } catch (error: unknown) {
    logger.error("removeInventoryItem failed", { error: String(prismaSafeErrorMeta(error)) });
    res.status(500).json({ ok: false, message: "Error removing item." });
  }
}

export async function updateInventory(req: Request, res: Response) {
  res.json({ ok: true, message: "Inventory synced." });
}
