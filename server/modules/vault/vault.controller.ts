import type { Request, Response } from "express";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../../utils/securityErrors.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../../utils/criticalMutationIdempotency.js";
import { prismaSafeErrorMeta } from "../../utils/prismaSafeError.js";
import loggerLib, { logUserActivity } from "../../utils/logger.js";
import {
  readErrorCode,
  readErrorMessage,
  readHttpStatus,
  readVaultSlot,
} from "../../controllers/controllerHttpStatusError.js";
import { VAULT_ERROR } from "./vault.errors.js";
import * as vaultService from "./vault.service.js";

const logger = loggerLib.child("VaultController");

function respondMoveToVaultError(req: Request, res: Response, error: unknown): void {
  const prismaCode = readErrorCode(error);
  if (prismaCode === "DISTRIBUTED_LOCK_BUSY") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  if (readErrorMessage(error) === VAULT_ERROR.ALREADY_STORED || prismaCode === VAULT_ERROR.ALREADY_STORED) {
    res.status(409).json({
      ok: false,
      code: VAULT_ERROR.ALREADY_STORED,
      messageKey: "vault.errors.VAULT_ALREADY_STORED",
      message: "This machine is already recorded in the warehouse. Refresh and try again.",
    });
    return;
  }
  if (readErrorMessage(error) === VAULT_ERROR.NOT_FOUND || readHttpStatus(error) === 404) {
    res.status(404).json({
      ok: false,
      code: "VAULT_NOT_FOUND",
      messageKey: "vault.errors.VAULT_NOT_FOUND",
      message: "Item not found.",
    });
    return;
  }
  if (readErrorMessage(error) === VAULT_ERROR.BAD_SOURCE) {
    res.status(400).json({
      ok: false,
      code: VAULT_ERROR.BAD_SOURCE,
      messageKey: "vault.errors.VAULT_BAD_SOURCE",
      message: "Invalid source.",
    });
    return;
  }
  const msg = readErrorMessage(error);
  if (msg === "INVALID_SELECTION" || msg === "INVALID_RACK_REF") {
    res.status(400).json({
      ok: false,
      code: SecurityErrorCodes.INVALID_STATE,
      messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
      message: msg === "INVALID_RACK_REF" ? "Invalid rack machine reference." : "Invalid inventory selection.",
    });
    return;
  }
  if (prismaCode === "P2034") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  logger.error("Move to Vault Error", {
    ...prismaSafeErrorMeta(error),
    prismaCode,
    userId: req.user?.id,
    source: req.body?.source,
  });
  if (prismaCode === "P2003" || prismaCode === "P2014" || prismaCode === "P2017") {
    res.status(409).json({
      ok: false,
      code: VAULT_ERROR.RACK_LINK,
      messageKey: "vault.errors.VAULT_RACK_LINK",
      message: "Machine is still linked to a rack. Refresh the page and try again.",
    });
    return;
  }
  if (prismaCode === "P2025") {
    res.status(404).json({
      ok: false,
      code: "VAULT_NOT_FOUND",
      messageKey: "vault.errors.VAULT_NOT_FOUND",
      message: "Item not found.",
    });
    return;
  }
  res.status(500).json({
    ok: false,
    code: VAULT_ERROR.UNAVAILABLE,
    messageKey: "vault.errors.VAULT_UNAVAILABLE",
    message: "Could not complete vault storage. Try again later.",
  });
}

function respondRetrieveFromVaultError(req: Request, res: Response, error: unknown): void {
  const prismaCode = readErrorCode(error);
  if (prismaCode === "DISTRIBUTED_LOCK_BUSY") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  if (readErrorMessage(error) === VAULT_ERROR.NOT_FOUND || readHttpStatus(error) === 404) {
    res.status(404).json({
      ok: false,
      code: "VAULT_NOT_FOUND",
      messageKey: "vault.errors.VAULT_NOT_FOUND",
      message: "Item not found in vault.",
    });
    return;
  }
  if (readErrorMessage(error) === VAULT_ERROR.BAD_DESTINATION) {
    res.status(400).json({
      ok: false,
      code: VAULT_ERROR.BAD_DESTINATION,
      messageKey: "vault.errors.VAULT_BAD_DESTINATION",
      message: "Invalid destination.",
    });
    return;
  }
  const msg = readErrorMessage(error);
  if (msg === "INVALID_SELECTION" || msg === "INVALID_VAULT_ITEM" || msg === "INVALID_SLOT") {
    res.status(400).json({
      ok: false,
      code: SecurityErrorCodes.INVALID_STATE,
      messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
      message:
        msg === "INVALID_SLOT"
          ? "Invalid slot position."
          : msg === "INVALID_VAULT_ITEM"
            ? "Invalid vault item."
            : "Invalid vault selection.",
    });
    return;
  }
  if (readErrorMessage(error) === VAULT_ERROR.INVALID_SLOT || readVaultSlot(error) != null) {
    res.status(400).json({
      ok: false,
      code: SecurityErrorCodes.INVALID_STATE,
      messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
      message: "Large machines must start on an even slot (1, 3, 5, 7 on UI).",
    });
    return;
  }
  if (prismaCode === "P2034") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  logger.error("Retrieve from Vault Error", {
    ...prismaSafeErrorMeta(error),
    userId: req.user?.id,
    vaultId: req.body?.vaultId,
    destination: req.body?.destination,
  });
  res.status(500).json({
    ok: false,
    code: VAULT_ERROR.RETRIEVE_ERROR,
    messageKey: "vault.retrieve_error",
    message: "Internal server error during vault retrieval.",
  });
}

export async function getVault(req: Request, res: Response) {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const vault = await vaultService.listVaultForUser(req.user.id);
    res.json({ ok: true, vault });
  } catch (error: unknown) {
    vaultService.logVaultListFailure(error);
    res.status(500).json({ ok: false, message: "Unable to load vault." });
  }
}

export async function moveToVault(req: Request, res: Response) {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const user = req.user;

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const result = await vaultService.moveToVaultForUser(user.id, req.body);
      const payload = {
        ok: true,
        message: "Machine moved to vault successfully!",
        movedCount: result.movedCount,
      };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      logUserActivity("VAULT_MOVE_TO", req, {
        source: result.source,
        movedCount: result.movedCount,
        machineId: result.machineId,
      });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      return respondMoveToVaultError(req, res, error);
    }
  } catch (error: unknown) {
    return respondMoveToVaultError(req, res, error);
  }
}

export async function retrieveFromVault(req: Request, res: Response) {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const user = req.user;

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const result = await vaultService.retrieveFromVaultForUser(user.id, req.body);
      const payload = {
        ok: true,
        message: "Machine retrieved from vault successfully!",
        movedCount: result.movedCount,
      };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      logUserActivity("VAULT_RETRIEVE_FROM", req, {
        destination: result.destination,
        movedCount: result.movedCount,
        vaultId: result.vaultId,
        slotIndex: result.slotIndex,
      });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      return respondRetrieveFromVaultError(req, res, error);
    }
  } catch (error: unknown) {
    return respondRetrieveFromVaultError(req, res, error);
  }
}
