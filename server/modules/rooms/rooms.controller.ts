import type { Request, Response } from "express";
import loggerLib from "../../utils/logger.js";
import { prismaSafeErrorMeta } from "../../utils/prismaSafeError.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../../utils/criticalMutationIdempotency.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../../utils/securityErrors.js";
import {
  readErrorCode,
  readErrorMessage,
  readHttpStatus,
  requireSessionUser,
} from "../../controllers/controllerHttpStatusError.js";
import { normalizeRackIds } from "./rooms.schemas.js";
import * as roomsService from "./rooms.service.js";

const logger = loggerLib.child("Rooms");

export async function listRooms(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const payload = await roomsService.listRoomsForUser(user.id);
    res.json(payload);
  } catch (err: unknown) {
    logger.error("listRooms error", { error: String(prismaSafeErrorMeta(err)) });
    res.status(500).json({ ok: false, message: "Erro ao listar salas." });
  }
}

export async function buyRoom(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const result = await roomsService.buyRoomForUser(user.id);
    if (!result.ok) {
      const body: Record<string, unknown> = { ok: false, message: result.message };
      if (result.code) body.code = result.code;
      res.status(result.status).json(body);
      return;
    }
    res.json({
      ok: true,
      roomNumber: result.roomNumber,
      roomId: result.roomId,
      message: result.message,
    });
  } catch (err: unknown) {
    logger.error("buyRoom error", { error: String(prismaSafeErrorMeta(err)) });
    res.status(500).json({ ok: false, message: "Erro ao comprar sala." });
  }
}

export async function installMiner(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const rackId = Number(req.body?.rackId);
    const inventoryId = Number(req.body?.inventoryId);

    if (!Number.isInteger(rackId) || rackId <= 0) {
      logger.warn("installMiner: invalid rackId", { userId: user.id, rackId });
      res.status(400).json({ ok: false, message: "rackId inválido." });
      return;
    }
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      logger.warn("installMiner: invalid inventoryId", { userId: user.id, inventoryId });
      res.status(400).json({ ok: false, message: "inventoryId inválido." });
      return;
    }

    const installPreflight = await roomsService.preflightInstallMiner(user.id, rackId, inventoryId);
    if (installPreflight) {
      const body: Record<string, unknown> = { ok: false, message: installPreflight.message };
      if (installPreflight.code) body.code = installPreflight.code;
      res.status(installPreflight.status).json(body);
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const result = await roomsService.installMinerForUser(user.id, rackId, inventoryId);
      if ("status" in result) {
        await cancelCriticalMutation(lease);
        const body: Record<string, unknown> = { ok: false, message: result.message };
        if (result.code) body.code = result.code;
        res.status(result.status).json(body);
        return;
      }
      const payload = { ok: true, message: "Máquina instalada com sucesso!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      res.json(payload);
    } catch (err: unknown) {
      await cancelCriticalMutation(lease);
      const errCode = readErrorCode(err);
      if (errCode === "DISTRIBUTED_LOCK_BUSY" || errCode === "P2034") {
        res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
        return;
      }
      logger.error("installMiner error", { error: String(prismaSafeErrorMeta(err)) });
      res.status(500).json({ ok: false, message: "Erro ao instalar máquina." });
    }
  } catch (err: unknown) {
    logger.error("installMiner error", { error: String(prismaSafeErrorMeta(err)) });
    res.status(500).json({ ok: false, message: "Erro ao instalar máquina." });
  }
}

export async function uninstallMiner(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const rackId = Number(req.body?.rackId);

    if (!Number.isInteger(rackId) || rackId <= 0) {
      logger.warn("uninstallMiner: invalid rackId", { userId: user.id, rackId });
      res.status(400).json({ ok: false, message: "rackId inválido." });
      return;
    }

    const uninstallPreflight = await roomsService.preflightUninstallMiner(user.id, rackId);
    if (uninstallPreflight) {
      const body: Record<string, unknown> = { ok: false, message: uninstallPreflight.message };
      if (uninstallPreflight.code) body.code = uninstallPreflight.code;
      res.status(uninstallPreflight.status).json(body);
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await roomsService.uninstallMinerForUser(user.id, rackId);
      const payload = { ok: true, message: "Máquina removida do rack com sucesso!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      res.json(payload);
    } catch (err: unknown) {
      await cancelCriticalMutation(lease);
      const errCode = readErrorCode(err);
      if (errCode === "DISTRIBUTED_LOCK_BUSY" || errCode === "P2034") {
        res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
        return;
      }
      const msg = readErrorMessage(err);
      const http = readHttpStatus(err);
      if (msg === "RACK_NOT_FOUND" || http === 404) {
        res.status(404).json({ ok: false, message: "Rack não encontrado." });
        return;
      }
      if (msg === "RACK_EMPTY" || errCode === "RACK_EMPTY") {
        res.status(400).json({ ok: false, code: "RACK_EMPTY", message: "Este rack não tem máquina instalada." });
        return;
      }
      logger.error("uninstallMiner error", { error: String(prismaSafeErrorMeta(err)) });
      res.status(500).json({ ok: false, message: "Erro ao remover máquina." });
    }
  } catch (err: unknown) {
    logger.error("uninstallMiner error", { error: String(prismaSafeErrorMeta(err)) });
    res.status(500).json({ ok: false, message: "Erro ao remover máquina." });
  }
}

export async function uninstallMinerBatch(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const rackIds = normalizeRackIds(req.body?.rackIds);

    if (rackIds.length === 0) {
      logger.warn("uninstallMinerBatch: invalid rackIds", { userId: user.id, rackIds: req.body?.rackIds });
      res.status(400).json({ ok: false, message: "rackIds inválidos." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await roomsService.uninstallMinerBatchForUser(user.id, rackIds);
      const payload = {
        ok: true,
        movedCount: rackIds.length,
        message: "Máquinas removidas do rack com sucesso!",
      };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      res.json(payload);
    } catch (err: unknown) {
      await cancelCriticalMutation(lease);
      const errCode = readErrorCode(err);
      if (errCode === "DISTRIBUTED_LOCK_BUSY" || errCode === "P2034") {
        res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
        return;
      }
      const msg = readErrorMessage(err);
      const http = readHttpStatus(err);
      if (msg === "RACK_NOT_FOUND" || http === 404) {
        res.status(404).json({ ok: false, message: "Rack não encontrado." });
        return;
      }
      if (msg === "RACK_EMPTY" || errCode === "RACK_EMPTY") {
        res.status(400).json({ ok: false, code: "RACK_EMPTY", message: "Um dos racks não tem máquina instalada." });
        return;
      }
      logger.error("uninstallMinerBatch error", { ...prismaSafeErrorMeta(err), userId: user.id, rackCount: rackIds.length });
      res.status(500).json({ ok: false, message: "Erro ao remover máquinas." });
    }
  } catch (err: unknown) {
    logger.error("uninstallMinerBatch error", { error: String(prismaSafeErrorMeta(err)) });
    res.status(500).json({ ok: false, message: "Erro ao remover máquinas." });
  }
}

export async function getSlotsSummary(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const payload = await roomsService.getSlotsSummaryForUser(user.id);
    res.json(payload);
  } catch (err: unknown) {
    logger.error("getSlotsSummary error", { error: String(prismaSafeErrorMeta(err)) });
    res.status(500).json({ ok: false, message: "Erro ao buscar slots." });
  }
}
